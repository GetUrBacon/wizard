#!/usr/bin/env node
"use strict";

const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { existsSync, readdirSync, statSync, mkdirSync, rmSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const chalk = require("chalk");
const { hasClerkToken } = require("./config-utils.cjs");

// ─── helpers ────────────────────────────────────────────────────────────────
//
// Ink stays mounted and in control of the terminal for the entire run — it
// never suspends or hands raw stdio to a subprocess. Login and preferences
// used to do that (readline + @clack/prompts inside a suspended window);
// both are now Ink-native (src/ui/Prompts.jsx) and every subprocess runs
// with piped stdio via spawnAsync. These chalk-based helpers are only used
// for the outro/failure summary printed to the real screen after
// leaveAltScreen() — everything Ink itself renders lives in the alternate
// screen buffer and needs a plain-text mirror once that buffer closes.

// chalk v4 (like Ink's own bundled chalk — see src/ui/theme.js) already
// fully respects NO_COLOR/FORCE_COLOR on its own by computing its color
// level from process.env at import time. No manual `NO_COLOR in
// process.env` branch is needed or wanted here — see tests/no-color.test.js.
//
// These are assigned once, inside main(), from src/ui/theme.js's exported
// ANSI color name constants — theme.js is ESM-only, so it's loaded via the same
// dynamic-import Promise.all() as ink/react/etc. Declaring them here (rather
// than inside main()) lets printOutroSummary() and configurePreferences()
// — both module-scope functions defined outside main() — keep closing over
// them unchanged; main() always assigns these before either function runs.
let dim, bright, mono, green, warn, fail;

function print(...lines) {
  for (const l of lines) process.stdout.write(l + "\n");
}

// Plain-text mirror of src/ui/OutroScreen.jsx, printed to the REAL screen
// after leaveAltScreen() — everything Ink ever rendered (this outro
// included) lives only in the alternate-screen buffer and is discarded the
// moment that buffer closes, so the final dashboard-link/config-commands
// summary has to be re-emitted here or it would just vanish along with the
// rest of the run instead of staying on screen for the user to read/copy.
function printOutroSummary(loggedIn, figures) {
  print(
    "",
    dim("  " + "─".repeat(48)),
    "",
    green(`  ${figures.tick} Bacon is set up!`),
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
function spawnAsync(bin, args = []) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: "pipe" });
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
const CONFIG_PATH = join(homedir(), ".bacon", "config.json");

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

// `bacon-setup init` is a one-shot, non-interactive check (it just writes
// config and returns a status code — nothing here ever reads from stdin),
// so unlike the login step below it has no need for `stdio: 'inherit'` at
// all. It used to run with inherited stdio, which let
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

// `cmd_login()` in bacon-setup (verified by reading the actual script) opens
// the browser itself via webbrowser.open() and waits on a local one-shot
// http.server callback (the same pattern PostHog's own OAuth flow uses) —
// it never reads stdin. So the only reason this ever needed `stdio: 'inherit'`
// was architectural leftover; askConfirm below is the sole interactive part,
// and it's Ink-native (no suspend, no raw stdio handoff at all).
//
// bacon-setup's own `main()` never calls sys.exit(1) when login fails or is
// cancelled — cmd_login() returns None and the script exits 0 regardless —
// so the subprocess's exit status can't tell us whether login succeeded.
// Check ~/.bacon/config.json for a real clerk_token afterward instead.
async function runLogin(steps, baconSetup, askConfirm) {
  // AskConfirm/ConfirmInput only ever resolves `true` (confirmed) or
  // CANCELLED (Escape/Ctrl+C/ConfirmInput's own cancel) — never plain false.
  const proceed = await askConfirm(
    "Time to connect your account. Your browser will open to sign in with Clerk — no prompts, no typing, just click Allow. Open the browser?"
  );
  if (proceed !== true) {
    steps.failStep(4, "Skipped — run `bacon-setup login` manually to connect later.");
    return false;
  }

  await spawnAsync("python3", [baconSetup, "login"]);

  if (!hasClerkToken(CONFIG_PATH)) {
    steps.failStep(4, "Login failed — run `bacon-setup login` manually to retry.");
    return false;
  }
  steps.okStep(4, "Account connected");
  return true;
}

const CANCELLED = Symbol("cancelled");

// Shared shape behind configurePreferences' three "run a python3 config
// subcommand, print a dim fallback note if it fails" call sites (setConfig,
// statusline-enable, spinner-enable) — only the argv and failure message
// differ between them.
async function runConfigCommand(args, failMessage) {
  const r = await spawnAsync("python3", args);
  if (r.status !== 0) print(`  ${dim("·")} ${dim(failMessage)}`);
  return r;
}

async function configurePreferences(baconSetup, { askSelect, askMultiSelect }, exitWith) {
  // Ink-native arrow-key preferences (src/ui/Prompts.jsx), swapped into
  // RunScreen's right pane in place of StepList — no suspend, no raw stdio
  // handoff. Frequency + personalization go to local config via
  // bacon-config. Surfaces is a multi-select: in-reply (default on; the
  // advertiser — not the user — picks the strip/card/banner format) plus
  // the statusline + thinking-verb opt-ins, enabled via bacon-setup (they
  // edit ~/.claude/settings.json).
  const baconConfigPath = join(dirname(baconSetup), "bacon-config");

  const guard = (v) => {
    if (v === CANCELLED) exitWith(0); // routes through Ink's unmount() instead of a bare process.exit
    return v;
  };
  const setConfig = (cmd, value) =>
    runConfigCommand([baconConfigPath, cmd, value], `Could not set ${cmd} to ${value}`);

  // Recommended option listed first in each — @inkjs/ui's Select always
  // visually focuses options[0] on mount (see the comment on AskSelect in
  // src/ui/Prompts.jsx), so this is what makes the sensible default the one
  // that's pre-highlighted and instantly confirmable with a bare Enter.
  const frequency = guard(await askSelect(
    "How often should ads appear?",
    [
      { value: "standard", label: "Standard (recommended) — ~$0.75/mo · 1 per 10 prompts" },
      { value: "minimal",  label: "Minimal — ~$0.40/mo · 1 per 20 prompts" },
      { value: "more",     label: "More — ~$1.50/mo · 1 per 5 prompts" },
      { value: "max",      label: "Max — ~$3.75/mo · 1 per 2 prompts" },
      { value: "every",    label: "Every prompt — ~$7.50/mo" },
    ]
  ));
  await setConfig("frequency", frequency);

  const profile = guard(await askSelect(
    "Personalization (your prompts/code/keys are NEVER shared)",
    [
      { value: "anonymous", label: "Anonymous (recommended) — no data shared · random ads" },
      { value: "stack",     label: "Stack — languages/deps shared · more relevant" },
      { value: "full",      label: "Full — stack + domain · most relevant (may earn more)" },
    ]
  ));
  await setConfig("profile", profile);

  const surfaces = guard(await askMultiSelect(
    "Where can ads appear?",
    [
      { value: "inreply",    label: "In replies — default · advertiser sets the format" },
      { value: "statusline", label: "Statusline — animated sponsor in the status bar" },
      { value: "spinner",    label: "Thinking verb — sponsored word while Claude works" },
    ],
    ["inreply", "spinner"]
  ));

  await setConfig("inreply", surfaces.includes("inreply") ? "on" : "off");
  if (surfaces.includes("statusline")) {
    await runConfigCommand([baconSetup, "statusline-enable", "--style", "marquee"], "Could not enable statusline");
  }
  if (surfaces.includes("spinner")) {
    await runConfigCommand([baconSetup, "spinner-enable"], "Could not enable thinking verb");
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
// These are terminal-mode-switching escapes, not color output — they are
// intentionally NOT gated on NO_COLOR (out of scope for that convention,
// which only covers color).
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[2J\x1b[H";
const LEAVE_ALT_SCREEN = "\x1b[0m\x1b[?1049l";

let leftAltScreen = false;
function leaveAltScreen() {
  if (leftAltScreen) return;
  leftAltScreen = true;
  process.stdout.write(LEAVE_ALT_SCREEN);
}

// Bridge from imperative main()-flow code to the Ink-native prompts: sets
// `picker` (rendered in RunScreen's right pane, see createApp() below) and
// resolves when the prompt component calls back, then clears `picker`
// before returning the value to the caller. askConfirm/askSelect/
// askMultiSelect (declared inside main(), where controllerRef lives) are
// all just this same set/resolve/clear shape with a different `type` and
// prompt-specific props layered in.
function ask(controllerRef, type, props) {
  return new Promise((resolve) => {
    controllerRef.current.setPicker({
      type,
      ...props,
      resolve: (v) => { controllerRef.current.setPicker(null); resolve(v); },
    });
  });
}

// Builds the root Ink component. Pulled out of main() (rather than declared
// inline) purely to keep main() readable — all its dependencies (the
// dynamically-imported Ink/React pieces, plus main()'s own controllerRef)
// are threaded through as arguments since this factory lives outside the
// dynamic-import scope. `controllerRef` points at the current render's
// { steps, startStep, okStep, failStep, addNote, setStage, setLoggedIn,
// setPicker } bundle.
// Pure function computing the hint pairs shown in KeyboardHintsBar at the
// bottom of the screen: empty unless we're on the 'run' stage with an active
// picker, in which case the hints match whichever Ask* component (see
// src/ui/Prompts.jsx) is currently rendered in place of StepList.
function computeKeyboardHints(stage, pickerType) {
  if (stage !== "run" || !pickerType) return [];
  if (pickerType === "confirm") {
    return [
      { label: "enter", action: "confirm" },
      { label: "esc", action: "cancel" },
    ];
  }
  if (pickerType === "select") {
    return [
      { label: "up/down", action: "move" },
      { label: "enter", action: "select" },
      { label: "esc", action: "cancel" },
    ];
  }
  if (pickerType === "multiselect") {
    return [
      { label: "up/down", action: "move" },
      { label: "space", action: "toggle" },
      { label: "enter", action: "confirm" },
      { label: "esc", action: "cancel" },
    ];
  }
  return [];
}

function createApp({
  React,
  useWizardSteps,
  Banner,
  HeaderBar,
  RunScreen,
  OutroScreen,
  AskConfirm,
  AskSelect,
  AskMultiSelect,
  KeyboardHintsBar,
  ScreenContainer,
  PACKAGE_VERSION,
  STEP_LABELS,
  controllerRef,
  CANCELLED,
}) {
  return function App() {
    const wiz = useWizardSteps(STEP_LABELS);
    const [stage, setStage] = React.useState("intro");
    const [loggedIn, setLoggedIn] = React.useState(false);
    const [picker, setPicker] = React.useState(null);
    controllerRef.current = { ...wiz, setStage, setLoggedIn, setPicker };

    // `picker`, when set, renders in place of StepList in RunScreen's right
    // pane (see RunScreen.jsx's `pickerNode` prop) — the ask*() bridge
    // functions below set/clear it around each interactive prompt.
    const pickerNode = !picker ? null : React.createElement(
      picker.type === "confirm" ? AskConfirm
        : picker.type === "select" ? AskSelect
        : AskMultiSelect,
      {
        message: picker.message,
        options: picker.options,
        initialValues: picker.initialValues,
        onSubmit: picker.resolve,
        onCancel: () => picker.resolve(CANCELLED),
      }
    );

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
        ? React.createElement(RunScreen, { steps: wiz.steps, total: STEP_LABELS.length, pickerNode })
        : React.createElement(Banner);

    const hints = computeKeyboardHints(stage, picker?.type);

    return React.createElement(
      ScreenContainer,
      null,
      React.createElement(HeaderBar, {
        left: `🥓 Bacon Wizard v${PACKAGE_VERSION}`,
        right: "geturbacon.dev",
      }),
      stageContent,
      React.createElement(KeyboardHintsBar, { hints })
    );
  };
}

async function main() {
  // Both stdin AND stdout must be a real TTY: this wizard requires genuine
  // interactivity (browser login, an arrow-key preference menu), and a
  // non-TTY stdout would garble full-screen/alt-screen rendering even with
  // an interactive stdin. Check this before anything else — before writing
  // ENTER_ALT_SCREEN, before registering the exit handler, before any
  // dynamic import — so a piped/non-interactive invocation fails fast with
  // a clear message instead of constructing an Ink render tree and then
  // hanging forever on the login/menu steps waiting for input that will
  // never come.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "bacon-wizard requires an interactive terminal (TTY) to run.\n" +
      "It looks like input or output is piped/non-interactive.\n" +
      "Run it directly in a terminal, or complete setup via Claude Code with /bacon:setup."
    );
    process.exit(1);
    return;
  }

  process.stdout.write(ENTER_ALT_SCREEN);
  process.on("exit", leaveAltScreen);

  neutralizeFalseCiDetection();

  // Ink/React/the UI components are ESM-only; load them via dynamic import
  // from this CJS bin.
  const [
    { default: React },
    { render },
    { default: Banner },
    { default: HeaderBar },
    { default: RunScreen },
    { default: OutroScreen },
    { useWizardSteps },
    { AskConfirm, AskSelect, AskMultiSelect },
    { default: KeyboardHintsBar },
    { default: TabContainer },
    { default: ScreenContainer },
    { default: figures },
    { SUCCESS, MUTED, PRIMARY, WARNING, LINK, ERROR },
  ] = await Promise.all([
    import("react"),
    import("ink"),
    import("../dist/ui/Banner.js"),
    import("../dist/ui/HeaderBar.js"),
    import("../dist/ui/RunScreen.js"),
    import("../dist/ui/OutroScreen.js"),
    import("../dist/ui/useWizardSteps.js"),
    import("../dist/ui/Prompts.js"),
    import("../dist/ui/KeyboardHintsBar.js"),
    import("../dist/ui/TabContainer.js"),
    import("../dist/ui/ScreenContainer.js"),
    import("figures"),
    import("../dist/ui/theme.js"),
  ]);
  void TabContainer; // wrapping now lives inside RunScreen.jsx itself, which already
  // has the `steps` prop in scope — imported here only for parity/consistency
  // with the rest of this dynamic-import block, not because bin/wizard.cjs
  // needs to render it directly.
  // theme.js's exported names are now ANSI color names (see src/ui/theme.js),
  // not hex strings — chalk[name] (e.g. chalk.green) is the correct mapping,
  // not chalk.hex(name). BRAND_GREEN/CREAM/DARK (unused here) are the only
  // exports that stayed hex.
  dim = chalk[MUTED];
  bright = chalk[PRIMARY];
  mono = chalk[LINK];
  green = chalk[SUCCESS];
  warn = chalk[WARNING];
  fail = chalk[ERROR];

  // One persistent Ink instance for the whole process — render() is called
  // exactly once here, unmount() exactly once at the end (or on a fatal
  // exit). Ink is never suspended and never hands raw stdio to a
  // subprocess — login (askConfirm) and preferences (askSelect/
  // askMultiSelect) are Ink-native prompts rendered in place of StepList's
  // right pane, resolved via the `picker` state below.
  //
  // `controllerRef` points at the current render's { steps, startStep,
  // okStep, failStep, addNote, setStage, setLoggedIn, setPicker } bundle.
  const controllerRef = { current: null };

  const App = createApp({
    React,
    useWizardSteps,
    Banner,
    HeaderBar,
    RunScreen,
    OutroScreen,
    AskConfirm,
    AskSelect,
    AskMultiSelect,
    KeyboardHintsBar,
    ScreenContainer,
    PACKAGE_VERSION,
    STEP_LABELS,
    controllerRef,
    CANCELLED,
  });

  const inkInstance = render(React.createElement(App));

  // Briefly show the intro art before moving into the run stage — no
  // confirm gate is added here (this stays a true one-command flow), the
  // art just gets a moment on screen instead of flashing by instantly.
  const INTRO_DISPLAY_MS = 700;
  await new Promise((resolve) => setTimeout(resolve, INTRO_DISPLAY_MS));
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

  // Thin, call-site-compatible wrappers around the shared ask() helper —
  // see its definition above for the set/resolve/clear mechanics.
  const askConfirm = (message) => ask(controllerRef, "confirm", { message });
  const askSelect = (message, options) => ask(controllerRef, "select", { message, options });
  const askMultiSelect = (message, options, initialValues) =>
    ask(controllerRef, "multiselect", { message, options, initialValues });

  function exitWith(code) {
    try { inkInstance.unmount(); } catch { /* already unmounted */ }
    leaveAltScreen();
    if (code !== 0 && lastFailureMessage) {
      print("", fail(`  ${figures.cross} ` + lastFailureMessage), "");
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
  const loggedIn = await runLogin(steps, baconSetup, askConfirm);
  controllerRef.current.setLoggedIn(loggedIn);

  // Step 5 — ad preferences
  steps.startStep(5);
  await configurePreferences(baconSetup, { askSelect, askMultiSelect }, exitWith);
  const onboarded = markOnboarded(baconSetup);
  if (!onboarded) steps.addNote(5, "Could not mark onboarding complete");
  steps.okStep(5, "Preferences saved");

  controllerRef.current.setStage("outro");
  // Give React/Ink one tick to commit the outro frame before we tear the
  // tree down — unmounting synchronously right after setStage() risks
  // racing the state update's commit.
  const OUTRO_SETTLE_MS = 50;
  await new Promise((resolve) => setTimeout(resolve, OUTRO_SETTLE_MS));
  inkInstance.unmount();
  leaveAltScreen();
  printOutroSummary(loggedIn, figures);
}

main().catch((e) => {
  // leaveAltScreen() first — otherwise this error (and its stack trace)
  // gets written into the alt-screen buffer and is discarded the instant
  // the process exits, leaving the user with no clue what happened.
  leaveAltScreen();
  console.error(e);
  process.exit(1);
});
