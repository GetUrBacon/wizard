#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const { homedir } = require("node:os");
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

function findBaconSetup() {
  // Look in the proper plugin cache location
  const cacheRoot = join(homedir(), ".claude", "plugins", "cache");
  if (existsSync(cacheRoot)) {
    for (const org of readdirSync(cacheRoot)) {
      let repos;
      try { repos = readdirSync(join(cacheRoot, org)); } catch { continue; }
      for (const repo of repos) {
        let versions;
        try { versions = readdirSync(join(cacheRoot, org, repo)); } catch { continue; }
        for (const ver of versions) {
          const candidate = join(cacheRoot, org, repo, ver, "bin", "bacon-setup");
          if (existsSync(candidate)) return candidate;
        }
      }
    }
  }
  const which = run("which", ["bacon-setup"]);
  if (which.ok) return which.out;
  return null;
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

function checkClaude() {
  const r = run("claude", ["--version"]);
  if (!r.ok) {
    fail("Claude Code CLI not found.");
    print(`  ${warn("→")} Install it from ${bright("https://claude.ai/code")} then re-run this wizard.`);
    process.exit(1);
  }
  ok(`Claude Code ${mono(r.out.split("\n")[0])}`);
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

async function configurePreferences(baconSetup) {
  // Ask preference questions in the terminal. Frequency + personalization go to
  // the local config via bacon-config. Surfaces are opt-in: in-reply is on by
  // default; statusline + thinking-verb are extra surfaces enabled via
  // bacon-setup (they edit ~/.claude/settings.json). The user never picks the
  // in-reply *format* — the advertiser's campaign sets strip/card/banner.
  const baconConfigPath = join(dirname(baconSetup), "bacon-config");

  const configQs = [
    {
      label: "How often should ads appear?",
      options: "[minimal|standard|more|max|every]",
      default: "standard",
      command: "frequency",
    },
    {
      label: "Personalization level?",
      options: "[anonymous|stack|full]",
      default: "anonymous",
      command: "profile",
      note: "More sharing = more relevant ads (may earn more); your prompts/code/keys are never shared.",
    },
  ];

  for (const q of configQs) {
    const answer = await prompt(`${q.label} ${dim(q.options)} [${q.default}]:`);
    const value = answer || q.default;
    if (q.note) note(q.note);
    const r = spawnSync("python3", [baconConfigPath, q.command, value], { stdio: "pipe" });
    if (r.status !== 0) note(`Could not set ${q.command} to ${value}`);
    else ok(`${q.command} → ${value}`);
  }

  // Surfaces — in-reply on by default, two optional extras.
  note("In-reply ads are on by default (the advertiser picks the format).");

  const wantStatusline = await prompt(
    `Also show the animated ${bright("statusline")} ad? ${dim("[y/N]")}:`
  );
  if (wantStatusline === "y" || wantStatusline === "yes") {
    const r = spawnSync("python3", [baconSetup, "statusline-enable", "--style", "marquee"], { stdio: "pipe" });
    if (r.status === 0) ok("statusline → on");
    else note("Could not enable statusline");
  }

  const wantSpinner = await prompt(
    `Show the sponsored ${bright("thinking verb")} while Claude works? ${dim("[y/N]")}:`
  );
  if (wantSpinner === "y" || wantSpinner === "yes") {
    const r = spawnSync("python3", [baconSetup, "spinner-enable"], { stdio: "pipe" });
    if (r.status === 0) ok("thinking verb → on");
    else note("Could not enable thinking verb");
  }
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
  const baconSetup = findBaconSetup();
  if (!baconSetup) {
    fail("bacon-setup not found. Open Claude Code and run /bacon:setup");
    process.exit(1);
  }
  runSetupInit(baconSetup);

  step(4, TOTAL, "Connecting your account");
  const loggedIn = await runLogin(baconSetup);

  step(5, TOTAL, "Choosing your ad preferences");
  await configurePreferences(baconSetup);
  markOnboarded(baconSetup);

  showDone(loggedIn);
}

main().catch((e) => { console.error(e); process.exit(1); });
