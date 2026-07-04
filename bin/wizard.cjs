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
// happens while the Ink step-list tree is intentionally unmounted/suspended
// (see `suspend()` in main()) — e.g. the "press ENTER" prompt before the
// Clerk login subprocess, or the final done screen after the wizard exits
// Ink for good. All *step progress* (the persistent step list) is rendered
// through src/ui/StepList.js + src/ui/useWizardSteps.js instead.

const green  = chalk.hex("#36e85a");
const dim    = chalk.hex("#74849e");
const bright = chalk.hex("#e9f1fc");
const warn   = chalk.hex("#f5a623");
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

// `suspend(fn)` (built in main()) tears down the Ink tree via
// withSuspendedRender() before running `fn`, then remounts it afterward — the
// spawnSync(..., { stdio: 'inherit' }) call below needs direct, unshared
// control of the terminal.
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

async function configurePreferences(baconSetup, p) {
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
      process.exit(0);
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

function showDone(loggedIn) {
  print(
    "",
    `  ${dim("─".repeat(48))}`,
    "",
    `  ${green("✓ Bacon is set up!")}`,
    "",
    loggedIn
      ? `  ${bright("Dashboard →")}  ${mono("https://geturbacon.dev/dashboard")}`
      : `  ${warn("→")} Connect later:  ${mono("bacon-setup login")}`,
    "",
    `  ${dim("Ads appear occasionally in Claude Code.")}`,
    `  ${dim("Your prompts never leave your machine.")}`,
    "",
    `  ${dim("configure")}  ${mono("bacon-config show")}`,
    `  ${dim("pause     ")}  ${mono("bacon-config pause")}`,
    "",
    `  ${dim("─".repeat(48))}`,
    ""
  );
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
    { render },
    { default: Banner },
    { default: StepList },
    { useWizardSteps, withSuspendedRender },
  ] = await Promise.all([
    import("react"),
    import("ink"),
    import("../src/ui/Banner.js"),
    import("../src/ui/StepList.js"),
    import("../src/ui/useWizardSteps.js"),
  ]);

  // `controllerRef` always points at the {steps, startStep, okStep, failStep,
  // addNote} object from the currently-mounted useWizardSteps() instance.
  // `eventLog` records every call made through the `steps` facade below so
  // that when we suspend Ink (unmounting the tree — and with it, the hook's
  // internal state) and remount afterward, replay() can reconstruct the
  // exact prior on-screen state on the fresh hook instance before continuing.
  const controllerRef = { current: null };
  const eventLog = [];

  const steps = {
    startStep: (...a) => { eventLog.push(["startStep", a]); controllerRef.current.startStep(...a); },
    okStep:    (...a) => { eventLog.push(["okStep", a]);    controllerRef.current.okStep(...a); },
    failStep:  (...a) => { eventLog.push(["failStep", a]);  controllerRef.current.failStep(...a); },
    addNote:   (...a) => { eventLog.push(["addNote", a]);   controllerRef.current.addNote(...a); },
  };

  function replay() {
    for (const [fn, args] of eventLog) controllerRef.current[fn](...args);
  }

  function App() {
    const wiz = useWizardSteps(STEP_LABELS);
    controllerRef.current = wiz;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Banner),
      React.createElement(StepList, { steps: wiz.steps, total: STEP_LABELS.length })
    );
  }

  function mount() {
    const instance = render(React.createElement(App));
    replay();
    return instance;
  }

  let inkInstance = mount();

  // Wraps withSuspendedRender(): tears Ink down, runs `fn` with the terminal
  // to itself, then remounts a fresh Ink tree (replaying prior state onto it)
  // before returning `fn`'s result to the caller.
  async function suspend(fn) {
    const result = await withSuspendedRender(inkInstance, fn);
    inkInstance = mount();
    return result;
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

  // Step 5 — ad preferences (@clack/prompts, ESM-only, dynamic import)
  steps.startStep(5);
  const clack = await import("@clack/prompts");
  await suspend(() => configurePreferences(baconSetup, clack));
  const onboarded = markOnboarded(baconSetup);
  if (!onboarded) steps.addNote(5, "Could not mark onboarding complete");
  steps.okStep(5, "Preferences saved");

  inkInstance.unmount();
  showDone(loggedIn);
}

main().catch((e) => { console.error(e); process.exit(1); });
