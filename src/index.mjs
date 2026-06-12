#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import chalk from "chalk";

// ─── helpers ────────────────────────────────────────────────────────────────

const green = chalk.hex("#36e85a");
const dim = chalk.hex("#74849e");
const bright = chalk.hex("#e9f1fc");
const warn = chalk.hex("#f5a623");
const err = chalk.hex("#e85a5a");
const mono = chalk.hex("#8a9bb5");

function print(...lines) {
  for (const l of lines) process.stdout.write(l + "\n");
}

function step(n, total, label) {
  print(`\n${dim(`[${n}/${total}]`)} ${bright(label)}`);
}

function ok(msg) {
  print(`  ${green("✓")} ${msg}`);
}

function fail(msg) {
  print(`  ${err("✗")} ${msg}`);
}

function note(msg) {
  print(`  ${dim("·")} ${dim(msg)}`);
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${mono("?")} ${bright(question)} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function run(bin, args = [], opts = {}) {
  try {
    const out = execFileSync(bin, args, { stdio: "pipe", encoding: "utf8", ...opts });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: e.stderr?.trim() ?? e.message };
  }
}

// ─── plugin path resolution ──────────────────────────────────────────────────

function findBaconSetup() {
  // Check ~/.bacon/config.json already exists (plugin already installed)
  const baconConfig = join(homedir(), ".bacon", "config.json");
  if (existsSync(baconConfig)) {
    // Try common locations
    const candidates = [
      // Claude Code user plugins dir (common)
      join(homedir(), ".claude", "plugins", "GetUrBacon", "bacon", "bin", "bacon-setup"),
      join(homedir(), ".claude", "plugins", "geturbacon", "bacon", "bin", "bacon-setup"),
      // npx cache / node_modules global
      join(homedir(), ".npm-global", "lib", "node_modules", "@getbacon", "plugin", "bin", "bacon-setup"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    // Try scanning ~/.claude/plugins for any bacon dir
    const pluginsRoot = join(homedir(), ".claude", "plugins");
    if (existsSync(pluginsRoot)) {
      for (const org of readdirSync(pluginsRoot)) {
        const orgDir = join(pluginsRoot, org);
        for (const repo of readdirSync(orgDir).catch?.(() => []) ?? []) {
          const candidate = join(orgDir, repo, "bin", "bacon-setup");
          if (existsSync(candidate)) return candidate;
        }
      }
    }
  }
  // Fall back to PATH
  const which = run("which", ["bacon-setup"]);
  if (which.ok) return which.out;
  return null;
}

// ─── steps ──────────────────────────────────────────────────────────────────

function checkNode() {
  const [major] = process.versions.node.split(".").map(Number);
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
    print(
      `  ${warn("→")} Install it from ${bright("https://claude.ai/code")} then re-run this wizard.`
    );
    process.exit(1);
  }
  ok(`Claude Code ${mono(r.out.split("\n")[0])}`);
}

function installPlugin() {
  note("running: claude plugin install github:GetUrBacon/bacon");
  const r = spawnSync("claude", ["plugin", "install", "github:GetUrBacon/bacon"], { stdio: "inherit" });
  if (r.status !== 0) {
    fail("Plugin install failed.");
    print(
      `  ${warn("→")} Try manually: ${mono("claude plugin install github:GetUrBacon/bacon")}`
    );
    process.exit(1);
  }
  ok("Plugin installed");
}

function runSetupInit(baconSetup) {
  note(`running: ${baconSetup} init`);
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
  const answer = await prompt("Ready to open the browser? [Y/n]");
  if (answer === "n" || answer === "no") {
    note("Skipping login — run `bacon-setup login` later to connect.");
    return false;
  }
  const r = spawnSync("python3", [baconSetup, "login"], { stdio: "inherit" });
  if (r.status !== 0) {
    fail("Login failed — run `bacon-setup login` manually to retry.");
    return false;
  }
  ok("Account connected");
  return true;
}

function showDone(loggedIn) {
  print(
    "",
    green("━".repeat(52)),
    "",
    `  ${green("🥓 Bacon is set up!")}`,
    "",
    loggedIn
      ? `  ${bright("Dashboard:")}  ${mono("https://geturbacon.com/dashboard")}`
      : `  ${warn("→")} Connect your account:  ${mono("bacon-setup login")}`,
    "",
    `  ${dim("Ads will appear occasionally in Claude Code.")}`,
    `  ${dim("Your prompts never leave your machine.")}`,
    "",
    `  ${dim("Configure:")}  ${mono("bacon-config show")}`,
    `  ${dim("Pause:    ")}  ${mono("bacon-config pause")}`,
    "",
    green("━".repeat(52)),
    ""
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

print(
  "",
  green("━".repeat(52)),
  `  ${green("🥓 Bacon")} ${bright("— setup wizard")}`,
  `  ${dim("Get paid to code. Ads in Claude Code, not in your way.")}`,
  green("━".repeat(52)),
  ""
);

const TOTAL = 4;

step(1, TOTAL, "Checking prerequisites");
checkNode();
checkClaude();

// Check if already installed
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
  fail("bacon-setup not found after install. Try opening Claude Code and running /bacon:setup");
  process.exit(1);
}
runSetupInit(baconSetup);

step(4, TOTAL, "Connecting your account");
const loggedIn = await runLogin(baconSetup);

showDone(loggedIn);
