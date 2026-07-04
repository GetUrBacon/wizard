#!/usr/bin/env node
"use strict";

const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { existsSync, readdirSync, statSync, mkdirSync, rmSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const readline = require("node:readline");
const chalk = require("chalk");

// ─── helpers ────────────────────────────────────────────────────────────────
//
// These chalk-based helpers are only used for plain terminal output that
// happens while Ink's spinner is frozen and the terminal is on loan to a raw
// subprocess/prompt (see `suspend()` in main()) — e.g. the "press ENTER"
// prompt before the Clerk login subprocess. All *step progress* (the
// persistent step list) is rendered through src/ui/StepList.js +
// src/ui/useWizardSteps.js instead, and the final done screen is now
// src/ui/OutroScreen.js, part of the same persistent Ink tree.

const dim    = chalk.hex("#74849e");
const bright = chalk.hex("#e9f1fc");
const mono   = chalk.hex("#8a9bb5");
const green  = chalk.hex("#36e85a");
const warn   = chalk.hex("#f5a623");
const fail   = chalk.hex("#e85a5a");

function print(...lines) {
  for (const l of lines) process.stdout.write(l + "\n");
}

// Plain-text mirror of src/ui/OutroScreen.jsx, printed to the REAL screen
// after leaveAltScreen() — everything Ink ever rendered (this outro
// included) lives only in the alternate-screen buffer and is discarded the
// moment that buffer closes, so the final dashboard-link/config-commands
// summary has to be re-emitted here or it would just vanish along with the
// rest of the run instead of staying on screen for the user to read/copy.
function printOutroSummary(loggedIn) {
  print(
    "",
    dim("  " + "─".repeat(48)),
    "",
    green("  ✓ Bacon is set up!"),
    ""
  );
  if (loggedIn) {
    print(`  ${bright("Dashboard →")}  ${mono("https://geturbacon.dev/dashboard")}`);
  } else {
    print(`  ${warn("→ Connect later:")}  ${mono("bacon-setup login")}`);
  }
  print(
    "",
    dim("  Ads appear occasionally in Claude Code."),
    dim("  Your prompts never leave your machine."),
    "",
    `  ${dim("configure")}  ${mono("bacon-config show")}`,
    `  ${dim("pause")}     ${mono("bacon-config pause")}`,
    "",
    dim("  " + "─".repeat(48)),
    ""
  );
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${mono("?")} ${bright(question)} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function run(bin, args = []) {
  try {
    const out = execFileSync(bin, args, { stdio: "pipe", encoding: "utf8" });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: e.stderr?.trim() ?? e.message };
  }
}

// Non-blocking counterpart to spawnSync. The steps that call this do real
// network/subprocess work (marketplace add, plugin install, git clone,
// `claude update`) that can take multiple seconds — spawnSync would freeze
// the entire event loop for that whole duration, which starves Ink of every
// tick it needs to paint the "running" spinner (the spinner's own
// setInterval can't fire, and no repaint can be written to stdout, while
// the thread is blocked in a sync syscall). spawn() lets Node's event loop
// keep running while the subprocess is alive, so the spinner animates for
// real instead of the screen freezing and then jumping straight to done.
function spawnAsync(bin, args = [], opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: "pipe", ...opts });
    } catch {
      resolve({ status: 1 });
      return;
    }
    child.on("error", () => resolve({ status: 1 }));
    child.on("close", (status) => resolve({ status }));
  });
}

// Yields one event-loop turn so a state update just queued (e.g. a
// startStep() call) gets a chance to actually commit and flush to the
// terminal before the next line of code runs. Without this, a step that
// starts and finishes within the same synchronous call stack (no await in
// between) never gets its "running" frame painted at all — React batches
// the running->ok transition and only the final state is ever written to
// stdout, so the step visually jumps straight from pending to done.
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ─── plugin path resolution ──────────────────────────────────────────────────

const PLUGIN_GIT_URL = "https://github.com/GetUrBacon/bacon.git";

// Recursively hunt for a file named `bacon-setup` under `root`. Claude Code's
// on-disk plugin layout differs across versions (1.x vs 2.x put the marketplace
// clone and the per-plugin cache in different places, at different depths), so
// rather than hard-code those paths we just walk the tree. Depth-capped and
// .git/node_modules-pruned so it stays fast.
function findFileNamed(root, name, maxDepth = 7) {
  if (!existsSync(root)) return null;
  const stack = [[root, 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (entry === name) {
        try { if (statSync(full).isFile()) return full; } catch { /* race */ }
      }
    }
    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      try { if (statSync(full).isDirectory()) stack.push([full, depth + 1]); } catch { /* race */ }
    }
  }
  return null;
}

// Locate an already-materialized bacon-setup that Claude Code placed on disk.
// Returns null if Claude hasn't extracted the plugin yet (it materializes
// lazily on some versions) — callers fall back to cloneBaconSetup().
function findBaconSetup() {
  const pluginsRoot = join(homedir(), ".claude", "plugins");
  return (
    findFileNamed(pluginsRoot, "bacon-setup") ||
    (() => { const w = run("which", ["bacon-setup"]); return w.ok ? w.out : null; })()
  );
}

// Version-independent fallback: clone the public plugin repo ourselves and run
// bacon-setup from that copy. The clone is self-contained (carries bacon_core.py
// and friends in bin/), so `python3 bacon-setup …` works regardless of whether
// Claude Code has finished installing the plugin into its own cache yet.
async function cloneBaconSetup() {
  if (!run("git", ["--version"]).ok) return null;
  let dest = join(homedir(), ".bacon", "plugin-src");
  try { mkdirSync(dirname(dest), { recursive: true }); }
  catch { dest = join(tmpdir(), "bacon-plugin-src"); }
  try { rmSync(dest, { recursive: true, force: true }); } catch { /* fresh */ }
  const r = await spawnAsync("git", ["clone", "--depth", "1", PLUGIN_GIT_URL, dest]);
  if (r.status !== 0) return null;
  const candidate = join(dest, "bin", "bacon-setup");
  return existsSync(candidate) ? candidate : null;
}

// Guaranteed resolver used by the setup steps: prefer Claude's own copy, else
// self-clone. Only returns null if both disk lookup AND git clone fail.
async function ensureBaconSetup() {
  return findBaconSetup() || (await cloneBaconSetup());
}

// ─── steps ──────────────────────────────────────────────────────────────────
//
// Each function below takes `steps` — a small facade over the object returned
// by useWizardSteps() (see main()) exposing startStep/okStep/failStep/addNote,
// always 1-based to match the on-screen "[n/total]" numbering. They replace
// the old chalk-based step()/ok()/fail()/note() console helpers 1:1 in terms
// of business logic and message text; only the rendering path changed.

async function checkNode(steps) {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
    await steps.holdMin(1);
    steps.failStep(1, `Node.js 18+ required (you have ${process.versions.node})`);
    return false;
  }
  steps.addNote(1, `Node.js ${process.versions.node}`);
  return true;
}

// Below this major, Claude Code's plugin tooling/layout is old enough to cause
// install quirks. We don't block on it (the self-clone fallback makes setup work
// regardless) — just nudge the user to update.
const MIN_CLAUDE_MAJOR = 2;

async function checkClaude(steps) {
  const r = run("claude", ["--version"]);
  if (!r.ok) {
    await steps.holdMin(1);
    steps.failStep(1, "Claude Code CLI not found.");
    steps.addNote(1, "Install it from https://claude.ai/code then re-run this wizard.");
    return false;
  }
  const versionLine = r.out.split("\n")[0];

  const m = versionLine.match(/(\d+)\.(\d+)\.(\d+)/);
  const major = m ? parseInt(m[1], 10) : null;
  if (major !== null && major < MIN_CLAUDE_MAJOR) {
    steps.addNote(1, `Claude Code ${m[0]} is outdated — update for the smoothest setup.`);
    steps.addNote(1, "running: claude update");
    const upd = await spawnAsync("claude", ["update"]);
    const after = run("claude", ["--version"]);
    const newVer = after.ok ? (after.out.match(/\d+\.\d+\.\d+/) || [])[0] : null;
    if (upd.status === 0 && newVer && newVer !== m[0]) {
      steps.addNote(1, `Updated to Claude Code ${newVer}`);
    } else {
      steps.addNote(1, "Couldn't auto-update. Run `claude update` yourself when convenient (setup will still continue).");
    }
  }

  await steps.holdMin(1);
  steps.okStep(1, `Claude Code ${versionLine}`);
  return true;
}

async function installPlugin(steps) {
  // Add the Bacon marketplace then install the plugin through it
  steps.addNote(2, "running: claude plugin marketplace add GetUrBacon/bacon");
  await spawnAsync(
    "claude", ["plugin", "marketplace", "add", "GetUrBacon/bacon"]
  );

  steps.addNote(2, "running: claude plugin install bacon@GetUrBacon");
  const install = await spawnAsync(
    "claude", ["plugin", "install", "bacon@GetUrBacon"]
  );

  await steps.holdMin(2);
  if (install.status === 0) {
    steps.okStep(2, "Plugin installed via marketplace");
    return true;
  }

  steps.failStep(2, "Plugin install failed — run `/plugin marketplace add GetUrBacon/bacon` then `/plugin install bacon@GetUrBacon` manually.");
  return false;
}

// `suspend(fn)` (built in main()) freezes the StepList spinner and calls
// withSuspendedRender() (clear, no unmount) before running `fn`, then
// un-freezes afterward.
//
// `bacon-setup init` is a one-shot, non-interactive check (it just writes
// config and returns a status code — nothing here ever reads from stdin),
// so unlike the login step below it has no need for `stdio: 'inherit'` or a
// suspended window at all. It used to run with inherited stdio, which let
// the script's own "✅ Config ready…" print land directly on the terminal
// while step 3's live (not-yet-Static) row had just been erased for it —
// the raw line then sat ABOVE this step's own heading once Ink resumed and
// flushed the finished row below wherever the subprocess had left the
// cursor. Piping stdio (spawnAsync's default) silences that duplicate,
// out-of-order line entirely and lets the spinner keep animating too,
// since spawnAsync doesn't block the event loop the way spawnSync did.
async function runSetupInit(steps, baconSetup) {
  steps.addNote(3, "running: bacon-setup init");
  const r = await spawnAsync("python3", [baconSetup, "init"]);
  await steps.holdMin(3);
  if (r.status !== 0) {
    steps.failStep(3, "Setup init failed — continuing anyway");
  } else {
    steps.okStep(3, "Config initialized at ~/.bacon/config.json");
  }
}

async function runLogin(steps, baconSetup, suspend) {
  // The "press ENTER" prompt and the login subprocess both need raw control
  // of stdin/stdout, so the whole sequence runs inside the suspended window.
  const r = await suspend(async () => {
    print(
      `\n  ${bright("Time to connect your account.")}`,
      `  ${dim("Your browser will open to sign in with Clerk.")}`,
      `  ${dim("No prompts, no typing — just click Allow.")}`
    );
    await prompt("Press ENTER to open the browser");
    return spawnSync("python3", [baconSetup, "login"], { stdio: "inherit" });
  });

  if (r.status !== 0) {
    steps.failStep(4, "Login failed — run `bacon-setup login` manually to retry.");
    return false;
  }
  steps.okStep(4, "Account connected");
  return true;
}

async function configurePreferences(baconSetup, p, exitWith) {
  // Arrow-key driven preferences via @clack/prompts (`p`). Frequency +
  // personalization go to the local config via bacon-config. Surfaces are a
  // multi-select: in-reply (default on; the advertiser — not the user — picks
  // the strip/card/banner format) plus the statusline + thinking-verb opt-ins,
  // which are enabled via bacon-setup (they edit ~/.claude/settings.json).
  //
  // This whole function runs while the Ink step-list tree is suspended (see
  // the `suspend()` call around it in main()) — @clack/prompts owns the
  // terminal for the duration, so any incidental messages here go through
  // plain print(), the same as the rest of the suspended-window output.
  const baconConfigPath = join(dirname(baconSetup), "bacon-config");

  const guard = (v) => {
    if (p.isCancel(v)) {
      p.cancel("Setup cancelled — finish anytime with /bacon:config");
      exitWith(0); // routes through Ink's unmount() instead of a bare process.exit
    }
    return v;
  };
  const setConfig = (cmd, value) => {
    const r = spawnSync("python3", [baconConfigPath, cmd, value], { stdio: "pipe" });
    if (r.status !== 0) print(`  ${dim("·")} ${dim(`Could not set ${cmd} to ${value}`)}`);
  };

  const frequency = guard(await p.select({
    message: "How often should ads appear?",
    initialValue: "standard",
    options: [
      { value: "minimal",  label: "Minimal",      hint: "~$0.40/mo · 1 per 20 prompts" },
      { value: "standard", label: "Standard",     hint: "~$0.75/mo · 1 per 10 prompts" },
      { value: "more",     label: "More",         hint: "~$1.50/mo · 1 per 5 prompts" },
      { value: "max",      label: "Max",          hint: "~$3.75/mo · 1 per 2 prompts" },
      { value: "every",    label: "Every prompt", hint: "~$7.50/mo" },
    ],
  }));
  setConfig("frequency", frequency);

  const profile = guard(await p.select({
    message: "Personalization (your prompts/code/keys are NEVER shared)",
    initialValue: "anonymous",
    options: [
      { value: "anonymous", label: "Anonymous", hint: "no data shared · random ads" },
      { value: "stack",     label: "Stack",     hint: "languages/deps shared · more relevant" },
      { value: "full",      label: "Full",      hint: "stack + domain · most relevant (may earn more)" },
    ],
  }));
  setConfig("profile", profile);

  const surfaces = guard(await p.multiselect({
    message: "Where can ads appear? (↑↓ move · space toggle · enter confirm)",
    required: false,
    initialValues: ["inreply"],
    options: [
      { value: "inreply",    label: "In replies",   hint: "default · advertiser sets the format" },
      { value: "statusline", label: "Statusline",   hint: "animated sponsor in the status bar" },
      { value: "spinner",    label: "Thinking verb", hint: "sponsored word while Claude works" },
    ],
  }));

  setConfig("inreply", surfaces.includes("inreply") ? "on" : "off");
  if (surfaces.includes("statusline")) {
    const r = spawnSync("python3", [baconSetup, "statusline-enable", "--style", "marquee"], { stdio: "pipe" });
    if (r.status !== 0) print(`  ${dim("·")} ${dim("Could not enable statusline")}`);
  }
  if (surfaces.includes("spinner")) {
    const r = spawnSync("python3", [baconSetup, "spinner-enable"], { stdio: "pipe" });
    if (r.status !== 0) print(`  ${dim("·")} ${dim("Could not enable thinking verb")}`);
  }
}

function markOnboarded(baconSetup) {
  // Mark onboarding complete so /bacon:setup skill won't re-prompt later.
  const r = spawnSync("python3", [baconSetup, "onboarded"], { stdio: "pipe" });
  return r.status === 0;
}

// ─── main ────────────────────────────────────────────────────────────────────

const STEP_LABELS = [
  "Checking prerequisites",
  "Installing Bacon plugin",
  "Initializing config",
  "Connecting your account",
  "Choosing your ad preferences",
];

const PACKAGE_VERSION = require("../package.json").version;

// Ink imports `is-in-ci`, which treats any of CI / CONTINUOUS_INTEGRATION /
// a CI_*-prefixed env var as "running in CI" — and when true, Ink's onRender
// never writes the live tree to stdout at all (it silently tracks the last
// frame in memory and only dumps it once, whenever the process happens to
// unmount). Some terminal-hosting apps (observed: Orca's embedded terminal)
// set a CI-look-alike env var for their own reasons, which silently breaks
// the whole wizard UI — no header bar, no split-pane, total silence through
// every step, then one glued-together frame dump right at exit. bacon-wizard
// is never actually meant to run in real CI (it requires a human to complete
// browser login and arrow-key preference selection), so it's safe and
// correct to neutralize these before Ink's `is-in-ci` check evaluates them
// (that check runs at module-load time, so this must happen before the
// dynamic `import("ink")` below).
function neutralizeFalseCiDetection() {
  delete process.env.CI;
  delete process.env.CONTINUOUS_INTEGRATION;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CI_")) delete process.env[key];
  }
}

// ─── alt-screen terminal handling ───────────────────────────────────────────
//
// Ink normally renders inline, appending this wizard's entire multi-step run
// to the user's real terminal scrollback permanently. Switching to the
// alternate screen buffer (the same mechanism vim/htop/less use) gives Ink a
// private, full-screen viewport instead: nothing the wizard ever prints —
// including any transient rendering hiccup mid-run — is left behind in the
// user's terminal history once the wizard exits and the original screen
// content is restored underneath it.
//
// `process.on("exit", ...)` (not a call at each individual exit point) is
// what guarantees this always runs — it fires synchronously on every exit
// path (normal completion, exitWith()'s process.exit(), the uncaught-error
// process.exit(1) in the main().catch() below, Ctrl+C). Leaving a process
// exited mid-alt-screen would strand the user's terminal showing nothing
// until they ran `reset` or opened a new tab, so this cannot be left to
// per-callsite discipline.
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[2J\x1b[H";
const LEAVE_ALT_SCREEN = "\x1b[0m\x1b[?1049l";

let leftAltScreen = false;
function leaveAltScreen() {
  if (leftAltScreen) return;
  leftAltScreen = true;
  process.stdout.write(LEAVE_ALT_SCREEN);
}

async function main() {
  process.stdout.write(ENTER_ALT_SCREEN);
  process.on("exit", leaveAltScreen);

  neutralizeFalseCiDetection();

  // Ink/React/the UI components are ESM-only; load them via dynamic import
  // from this CJS bin, same pattern already used for @clack/prompts below.
  const [
    { default: React },
    { render },
    { default: Banner },
    { default: HeaderBar },
    { default: RunScreen },
    { default: OutroScreen },
    { useWizardSteps, withSuspendedRender },
  ] = await Promise.all([
    import("react"),
    import("ink"),
    import("../dist/ui/Banner.js"),
    import("../dist/ui/HeaderBar.js"),
    import("../dist/ui/RunScreen.js"),
    import("../dist/ui/OutroScreen.js"),
    import("../dist/ui/useWizardSteps.js"),
  ]);

  // One persistent Ink instance for the whole process — render() is called
  // exactly once here, unmount() exactly once at the end (or on a fatal
  // exit). Earlier this app fully unmounted/remounted Ink around every
  // raw-stdio window, which repainted the entire tree (banner included)
  // from scratch each time — see the doc comment on withSuspendedRender()
  // in useWizardSteps.js for the full explanation of why that duplicated
  // output and why a single persistent instance fixes it structurally.
  //
  // `controllerRef` points at the current render's { steps, startStep,
  // okStep, failStep, addNote, setStage, setSuspended, setLoggedIn }
  // bundle. No eventLog/replay is needed anymore — there's only ever one
  // hook instance for the life of the process.
  const controllerRef = { current: null };

  function App() {
    const wiz = useWizardSteps(STEP_LABELS);
    const [stage, setStage] = React.useState("intro");
    const [suspended, setSuspended] = React.useState(false);
    const [loggedIn, setLoggedIn] = React.useState(false);
    controllerRef.current = { ...wiz, setStage, setSuspended, setLoggedIn };

    // Exactly one stage's content renders below the header at a time —
    // switching stages fully replaces the previous stage's content instead
    // of leaving it visible (no <Static>/permanent commit here: Ink's normal
    // re-render already erases-and-redraws the previous frame, which is
    // what makes a clean screen-to-screen swap the default behavior once
    // nothing is opted out of it via <Static>).
    const stageContent =
      stage === "outro"
        ? React.createElement(OutroScreen, { loggedIn })
        : stage === "run"
        ? React.createElement(RunScreen, { steps: wiz.steps, total: STEP_LABELS.length, suspended })
        : React.createElement(Banner);

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(HeaderBar, {
        left: `🥓 Bacon Wizard v${PACKAGE_VERSION}`,
        right: "geturbacon.dev",
      }),
      stageContent
    );
  }

  const inkInstance = render(React.createElement(App));

  // Briefly show the intro art before moving into the run stage — no
  // confirm gate is added here (this stays a true one-command flow), the
  // art just gets a moment on screen instead of flashing by instantly.
  await new Promise((resolve) => setTimeout(resolve, 700));
  controllerRef.current.setStage("run");

  // Steps 1–3 do their real work (version checks, plugin lookup, config
  // init) in tens of milliseconds — fast enough that even with a real event-
  // loop tick between startStep() and the ok/fail call (see tick()/
  // spawnAsync above), the "running" spinner is only ever on screen for a
  // single render frame. That's real, correctly-painted output, but it's too
  // brief for a human to perceive as "it ran" — it still reads as an
  // instant jump from pending to done. holdMin(n) is a deliberate minimum-
  // visible-duration floor (the same "debounced spinner" pattern web UIs use
  // for fast API calls): each check function awaits it immediately before
  // its terminal okStep/failStep call, so the running state stays on screen
  // for at least MIN_STEP_RUNNING_MS regardless of how fast the underlying
  // check actually was. Steps 4/5 never call this — they're already gated
  // on real human interaction (browser login, arrow-key menus) and take
  // seconds regardless.
  const MIN_STEP_RUNNING_MS = 400;
  const stepStartedAt = new Map();

  // exitWith() leaves the alt screen on any failure exit, which discards
  // the failed step's red ✗ message along with everything else Ink ever
  // rendered — so the reason for the failure has to be captured here and
  // re-printed to the real screen afterward, or the user is left staring
  // at a terminal that reverted to whatever was on it before the wizard
  // ran, with no indication of what went wrong.
  let lastFailureMessage = null;

  const steps = {
    startStep: (...a) => {
      stepStartedAt.set(a[0], Date.now());
      return controllerRef.current.startStep(...a);
    },
    okStep:    (...a) => controllerRef.current.okStep(...a),
    failStep:  (...a) => {
      lastFailureMessage = a[1];
      return controllerRef.current.failStep(...a);
    },
    addNote:   (...a) => controllerRef.current.addNote(...a),
    async holdMin(n) {
      const startedAt = stepStartedAt.get(n);
      if (startedAt == null) return;
      const remaining = MIN_STEP_RUNNING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    },
  };

  // Freezes the StepList spinner (so it can't self-trigger a repaint),
  // hands the terminal to `fn` via withSuspendedRender() (clear, but no
  // unmount), then un-freezes.
  async function suspend(fn) {
    controllerRef.current.setSuspended(true);
    // setSuspended(true) (plus whatever step-status update just preceded
    // this call, e.g. startStep()) is an async React state update — it
    // queues a re-render that isn't guaranteed to have committed and
    // flushed to stdout by the time this function continues. Verified via
    // a real PTY capture (rendered through pyte) that without waiting here,
    // that pending repaint can flush AFTER fn() has already started writing
    // raw output (readline's prompt text), gluing the header bar onto it
    // with no separating newline. This 100ms wait reliably avoids that in
    // realistic usage — also verified via a PTY capture with a *simulated
    // real keypress* (~1.2s reaction time before answering the prompt),
    // which renders cleanly. The theoretical race only reopens if fn()'s
    // own first await never resolves at all (e.g. stdin is closed/non-TTY,
    // so readline's prompt hangs forever) — a real interactive user always
    // takes far longer than 100ms to react, so this is accepted as a
    // non-interactive-environment edge case, not a real-usage bug.
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      return await withSuspendedRender(inkInstance, fn);
    } finally {
      // fn()'s raw output (readline/clack/a subprocess) doesn't guarantee it
      // ends with a trailing newline — e.g. readline's rl.question() leaves
      // the cursor right after the prompt text until the user's Enter is
      // echoed, which doesn't always happen (non-interactive stdin, some
      // terminal modes). A bare "\n" is NOT enough here: it's a line feed
      // only — it moves the cursor down a row but does not reset the
      // column, unless the terminal's ONLCR driver setting happens to
      // translate it to CRLF (verified via a real PTY capture, rendered
      // through pyte, that this is not guaranteed — readline can leave the
      // cursor at an arbitrary column, e.g. matching the prompt text's
      // length, and Ink's next frame then starts painting from THAT column
      // instead of column 0, gluing its first line onto the tail of
      // whatever fn() last printed). Write "\r\n" explicitly so both the
      // column reset and the line advance happen regardless of terminal
      // driver settings.
      process.stdout.write("\r\n");
      controllerRef.current.setSuspended(false);
    }
  }

  function exitWith(code) {
    try { inkInstance.unmount(); } catch { /* already unmounted */ }
    leaveAltScreen();
    if (code !== 0 && lastFailureMessage) {
      print("", fail("  ✗ " + lastFailureMessage), "");
    }
    process.exit(code);
  }

  // Step 1 — prerequisites
  steps.startStep(1);
  await tick();
  if (!(await checkNode(steps))) { exitWith(1); return; }
  if (!(await checkClaude(steps))) { exitWith(1); return; }

  // Step 2 — plugin install (skip entirely if already installed)
  const alreadyInstalled = !!findBaconSetup();
  if (alreadyInstalled) {
    steps.okStep(2, "Plugin already installed — skipping reinstall");
  } else {
    steps.startStep(2);
    await tick();
    if (!(await installPlugin(steps))) { exitWith(1); return; }
  }

  // Step 3 — config init
  steps.startStep(3);
  await tick();
  const baconSetup = await ensureBaconSetup();
  if (!baconSetup) {
    steps.failStep(3, "Could not locate or fetch bacon-setup.");
    steps.addNote(3, "Open Claude Code and run /bacon:setup to finish.");
    exitWith(1);
    return;
  }
  await runSetupInit(steps, baconSetup);

  // Step 4 — connect account
  steps.startStep(4);
  const loggedIn = await runLogin(steps, baconSetup, suspend);
  controllerRef.current.setLoggedIn(loggedIn);

  // Step 5 — ad preferences (@clack/prompts, ESM-only, dynamic import)
  steps.startStep(5);
  const clack = await import("@clack/prompts");
  await suspend(() => configurePreferences(baconSetup, clack, exitWith));
  const onboarded = markOnboarded(baconSetup);
  if (!onboarded) steps.addNote(5, "Could not mark onboarding complete");
  steps.okStep(5, "Preferences saved");

  controllerRef.current.setStage("outro");
  // Give React/Ink one tick to commit the outro frame before we tear the
  // tree down — unmounting synchronously right after setStage() risks
  // racing the state update's commit.
  await new Promise((resolve) => setTimeout(resolve, 50));
  inkInstance.unmount();
  leaveAltScreen();
  printOutroSummary(loggedIn);
}

main().catch((e) => {
  // leaveAltScreen() first — otherwise this error (and its stack trace)
  // gets written into the alt-screen buffer and is discarded the instant
  // the process exits, leaving the user with no clue what happened.
  leaveAltScreen();
  console.error(e);
  process.exit(1);
});
