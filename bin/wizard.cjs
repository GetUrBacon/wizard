#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
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

function print(...lines) {
  for (const l of lines) process.stdout.write(l + "\n");
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
function cloneBaconSetup() {
  if (!run("git", ["--version"]).ok) return null;
  let dest = join(homedir(), ".bacon", "plugin-src");
  try { mkdirSync(dirname(dest), { recursive: true }); }
  catch { dest = join(tmpdir(), "bacon-plugin-src"); }
  try { rmSync(dest, { recursive: true, force: true }); } catch { /* fresh */ }
  const r = spawnSync("git", ["clone", "--depth", "1", PLUGIN_GIT_URL, dest], { stdio: "pipe" });
  if (r.status !== 0) return null;
  const candidate = join(dest, "bin", "bacon-setup");
  return existsSync(candidate) ? candidate : null;
}

// Guaranteed resolver used by the setup steps: prefer Claude's own copy, else
// self-clone. Only returns null if both disk lookup AND git clone fail.
function ensureBaconSetup() {
  return findBaconSetup() || cloneBaconSetup();
}

// ─── steps ──────────────────────────────────────────────────────────────────
//
// Each function below takes `steps` — a small facade over the object returned
// by useWizardSteps() (see main()) exposing startStep/okStep/failStep/addNote,
// always 1-based to match the on-screen "[n/total]" numbering. They replace
// the old chalk-based step()/ok()/fail()/note() console helpers 1:1 in terms
// of business logic and message text; only the rendering path changed.

function checkNode(steps) {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
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

function checkClaude(steps) {
  const r = run("claude", ["--version"]);
  if (!r.ok) {
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
    const upd = spawnSync("claude", ["update"], { stdio: "pipe" });
    const after = run("claude", ["--version"]);
    const newVer = after.ok ? (after.out.match(/\d+\.\d+\.\d+/) || [])[0] : null;
    if (upd.status === 0 && newVer && newVer !== m[0]) {
      steps.addNote(1, `Updated to Claude Code ${newVer}`);
    } else {
      steps.addNote(1, "Couldn't auto-update. Run `claude update` yourself when convenient (setup will still continue).");
    }
  }

  steps.okStep(1, `Claude Code ${versionLine}`);
  return true;
}

function installPlugin(steps) {
  // Add the Bacon marketplace then install the plugin through it
  steps.addNote(2, "running: claude plugin marketplace add GetUrBacon/bacon");
  spawnSync(
    "claude", ["plugin", "marketplace", "add", "GetUrBacon/bacon"],
    { stdio: "pipe" }
  );

  steps.addNote(2, "running: claude plugin install bacon@GetUrBacon");
  const install = spawnSync(
    "claude", ["plugin", "install", "bacon@GetUrBacon"],
    { stdio: "pipe" }
  );

  if (install.status === 0) {
    steps.okStep(2, "Plugin installed via marketplace");
    return true;
  }

  steps.failStep(2, "Plugin install failed — run `/plugin marketplace add GetUrBacon/bacon` then `/plugin install bacon@GetUrBacon` manually.");
  return false;
}

// `suspend(fn)` (built in main()) freezes the StepList spinner and calls
// withSuspendedRender() (clear, no unmount) before running `fn`, then
// un-freezes afterward — the spawnSync(..., { stdio: 'inherit' }) call below
// needs the terminal free of any concurrent Ink-driven repaints.
async function runSetupInit(steps, baconSetup, suspend) {
  steps.addNote(3, "running: bacon-setup init");
  const r = await suspend(() => spawnSync("python3", [baconSetup, "init"], { stdio: "inherit" }));
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

async function main() {
  // Ink/React/the UI components are ESM-only; load them via dynamic import
  // from this CJS bin, same pattern already used for @clack/prompts below.
  const [
    { default: React },
    { render, Static },
    { default: Banner },
    { default: StepList },
    { default: OutroScreen },
    { useWizardSteps, withSuspendedRender },
  ] = await Promise.all([
    import("react"),
    import("ink"),
    import("../src/ui/Banner.js"),
    import("../src/ui/StepList.js"),
    import("../src/ui/OutroScreen.js"),
    import("../src/ui/useWizardSteps.js"),
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
    const [stage, setStage] = React.useState("run");
    const [suspended, setSuspended] = React.useState(false);
    const [loggedIn, setLoggedIn] = React.useState(false);
    controllerRef.current = { ...wiz, setStage, setSuspended, setLoggedIn };

    return React.createElement(
      React.Fragment,
      null,
      // Banner is committed once via <Static> and never revisited — Ink
      // guarantees Static items are painted exactly once and left alone,
      // which is what makes banner duplication structurally impossible
      // here rather than just "unlikely."
      React.createElement(
        Static,
        { items: ["banner"] },
        (item) => React.createElement(Banner, { key: item })
      ),
      // The step list stays on screen at outro (matching the old behavior
      // where showDone() printed below the persisted step list) — it's no
      // longer receiving updates by the time stage flips to "outro", so
      // leaving it mounted just shows the final completed checklist above
      // the summary card rather than replacing it.
      React.createElement(StepList, { steps: wiz.steps, total: STEP_LABELS.length, suspended }),
      stage === "outro" ? React.createElement(OutroScreen, { loggedIn }) : null
    );
  }

  const inkInstance = render(React.createElement(App));

  const steps = {
    startStep: (...a) => controllerRef.current.startStep(...a),
    okStep:    (...a) => controllerRef.current.okStep(...a),
    failStep:  (...a) => controllerRef.current.failStep(...a),
    addNote:   (...a) => controllerRef.current.addNote(...a),
  };

  // Freezes the StepList spinner (so it can't self-trigger a repaint),
  // hands the terminal to `fn` via withSuspendedRender() (clear, but no
  // unmount), then un-freezes.
  async function suspend(fn) {
    controllerRef.current.setSuspended(true);
    try {
      return await withSuspendedRender(inkInstance, fn);
    } finally {
      controllerRef.current.setSuspended(false);
    }
  }

  function exitWith(code) {
    try { inkInstance.unmount(); } catch { /* already unmounted */ }
    process.exit(code);
  }

  // Step 1 — prerequisites
  steps.startStep(1);
  if (!checkNode(steps)) { exitWith(1); return; }
  if (!checkClaude(steps)) { exitWith(1); return; }

  // Step 2 — plugin install (skip entirely if already installed)
  const alreadyInstalled = !!findBaconSetup();
  if (alreadyInstalled) {
    steps.okStep(2, "Plugin already installed — skipping reinstall");
  } else {
    steps.startStep(2);
    if (!installPlugin(steps)) { exitWith(1); return; }
  }

  // Step 3 — config init
  steps.startStep(3);
  const baconSetup = ensureBaconSetup();
  if (!baconSetup) {
    steps.failStep(3, "Could not locate or fetch bacon-setup.");
    steps.addNote(3, "Open Claude Code and run /bacon:setup to finish.");
    exitWith(1);
    return;
  }
  await runSetupInit(steps, baconSetup, suspend);

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
}

main().catch((e) => { console.error(e); process.exit(1); });
