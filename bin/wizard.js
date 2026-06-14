#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, readdirSync, statSync, mkdirSync, rmSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const readline = require("node:readline");
const chalk = require("chalk");

// ─── helpers ────────────────────────────────────────────────────────────────

const green  = chalk.hex("#36e85a");
const dim    = chalk.hex("#74849e");
const bright = chalk.hex("#e9f1fc");
const warn   = chalk.hex("#f5a623");
const error  = chalk.hex("#e85a5a");
const mono   = chalk.hex("#8a9bb5");

function print(...lines) {
  for (const l of lines) process.stdout.write(l + "\n");
}
function step(n, total, label) {
  print(`\n${dim(`[${n}/${total}]`)} ${bright(label)}`);
}
function ok(msg)   { print(`  ${green("✓")} ${msg}`); }
function fail(msg) { print(`  ${error("✗")} ${msg}`); }
function note(msg) { print(`  ${dim("·")} ${dim(msg)}`); }

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

function checkNode() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
    fail(`Node.js 18+ required (you have ${process.versions.node})`);
    process.exit(1);
  }
  ok(`Node.js ${process.versions.node}`);
}

// Below this major, Claude Code's plugin tooling/layout is old enough to cause
// install quirks. We don't block on it (the self-clone fallback makes setup work
// regardless) — just nudge the user to update.
const MIN_CLAUDE_MAJOR = 2;

function checkClaude() {
  const r = run("claude", ["--version"]);
  if (!r.ok) {
    fail("Claude Code CLI not found.");
    print(`  ${warn("→")} Install it from ${bright("https://claude.ai/code")} then re-run this wizard.`);
    process.exit(1);
  }
  const versionLine = r.out.split("\n")[0];
  ok(`Claude Code ${mono(versionLine)}`);

  const m = versionLine.match(/(\d+)\.(\d+)\.(\d+)/);
  const major = m ? parseInt(m[1], 10) : null;
  if (major !== null && major < MIN_CLAUDE_MAJOR) {
    print(`  ${warn("⚠")} ${warn(`Claude Code ${m[0]} is outdated — update for the smoothest setup.`)}`);
    note("running: claude update");
    const upd = spawnSync("claude", ["update"], { stdio: "pipe" });
    const after = run("claude", ["--version"]);
    const newVer = after.ok ? (after.out.match(/\d+\.\d+\.\d+/) || [])[0] : null;
    if (upd.status === 0 && newVer && newVer !== m[0]) {
      ok(`Updated to Claude Code ${mono(newVer)}`);
    } else {
      print(`  ${warn("→")} Couldn't auto-update. Run ${bright("claude update")} yourself when convenient (setup will still continue).`);
    }
  }
}

function installPlugin() {
  // Add the Bacon marketplace then install the plugin through it
  note("running: claude plugin marketplace add GetUrBacon/bacon");
  const addMarket = spawnSync(
    "claude", ["plugin", "marketplace", "add", "GetUrBacon/bacon"],
    { stdio: "pipe" }
  );

  note("running: claude plugin install bacon@GetUrBacon");
  const install = spawnSync(
    "claude", ["plugin", "install", "bacon@GetUrBacon"],
    { stdio: "pipe" }
  );

  if (install.status === 0) {
    ok("Plugin installed via marketplace");
    return;
  }

  fail("Plugin install failed — run `/plugin marketplace add GetUrBacon/bacon` then `/plugin install bacon@GetUrBacon` manually.");
  process.exit(1);
}

function runSetupInit(baconSetup) {
  note("running: bacon-setup init");
  const r = spawnSync("python3", [baconSetup, "init"], { stdio: "inherit" });
  if (r.status !== 0) {
    fail("Setup init failed — continuing anyway");
  } else {
    ok("Config initialized at ~/.bacon/config.json");
  }
}

async function runLogin(baconSetup) {
  print(
    `\n  ${bright("Time to connect your account.")}`,
    `  ${dim("Your browser will open to sign in with Clerk.")}`,
    `  ${dim("No prompts, no typing — just click Allow.")}`
  );
  await prompt("Press ENTER to open the browser");

  const r = spawnSync("python3", [baconSetup, "login"], { stdio: "inherit" });
  if (r.status !== 0) {
    fail("Login failed — run `bacon-setup login` manually to retry.");
    return false;
  }
  ok("Account connected");
  return true;
}

async function configurePreferences(baconSetup, p) {
  // Arrow-key driven preferences via @clack/prompts (`p`). Frequency +
  // personalization go to the local config via bacon-config. Surfaces are a
  // multi-select: in-reply (default on; the advertiser — not the user — picks
  // the strip/card/banner format) plus the statusline + thinking-verb opt-ins,
  // which are enabled via bacon-setup (they edit ~/.claude/settings.json).
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
    if (r.status !== 0) note(`Could not set ${cmd} to ${value}`);
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
    if (r.status !== 0) note("Could not enable statusline");
  }
  if (surfaces.includes("spinner")) {
    const r = spawnSync("python3", [baconSetup, "spinner-enable"], { stdio: "pipe" });
    if (r.status !== 0) note("Could not enable thinking verb");
  }
  ok("Preferences saved");
}

function markOnboarded(baconSetup) {
  // Mark onboarding complete so /bacon:setup skill won't re-prompt later.
  const r = spawnSync("python3", [baconSetup, "onboarded"], { stdio: "pipe" });
  if (r.status !== 0) {
    note("Could not mark onboarding complete");
  }
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

// ─── banner ──────────────────────────────────────────────────────────────────

const BACON_ART = [
  "  ██████╗  █████╗  ██████╗ ██████╗ ███╗   ██╗",
  "  ██╔══██╗██╔══██╗██╔════╝██╔═══██╗████╗  ██║",
  "  ██████╔╝███████║██║     ██║   ██║██╔██╗ ██║",
  "  ██╔══██╗██╔══██║██║     ██║   ██║██║╚██╗██║",
  "  ██████╔╝██║  ██║╚██████╗╚██████╔╝██║ ╚████║",
  "  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝",
];

const STRIP = [
  "  ░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░",
  "  ▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓",
  "  ░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░",
];

function printBanner() {
  print("");
  for (const line of BACON_ART) print(green(line) + "  🥓");
  print("");
  for (const line of STRIP) {
    // alternate fat (bright cream) and lean (green) chars
    let out = "";
    for (const ch of line) {
      out += ch === "░" ? chalk.hex("#e9d9b8")(ch) : chalk.hex("#36e85a")(ch);
    }
    print(out);
  }
  print("");
  print(`  ${bright("setup wizard")}  ${dim("·")}  ${dim("get paid to code")}`);
  print(`  ${dim("─".repeat(48))}`);
  print("");
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

  const TOTAL = 5;

  step(1, TOTAL, "Checking prerequisites");
  checkNode();
  checkClaude();

  const alreadyInstalled = !!findBaconSetup();
  if (alreadyInstalled) {
    ok("Plugin already installed — skipping reinstall");
  } else {
    step(2, TOTAL, "Installing Bacon plugin");
    installPlugin();
  }

  step(3, TOTAL, "Initializing config");
  const baconSetup = ensureBaconSetup();
  if (!baconSetup) {
    fail("Could not locate or fetch bacon-setup.");
    print(`  ${warn("→")} Open Claude Code and run ${bright("/bacon:setup")} to finish.`);
    process.exit(1);
  }
  runSetupInit(baconSetup);

  step(4, TOTAL, "Connecting your account");
  const loggedIn = await runLogin(baconSetup);

  step(5, TOTAL, "Choosing your ad preferences");
  // @clack/prompts is ESM-only; load it via dynamic import from this CJS bin.
  const clack = await import("@clack/prompts");
  await configurePreferences(baconSetup, clack);
  markOnboarded(baconSetup);

  showDone(loggedIn);
}

main().catch((e) => { console.error(e); process.exit(1); });
