"use strict";
// Split out from wizard.cjs so it can be `require()`d directly by tests
// without executing the wizard itself (wizard.cjs calls main() at the
// bottom as a side effect of being loaded).

const { readFileSync } = require("node:fs");

// bacon-setup's own `main()` never calls sys.exit(1) on a failed/cancelled
// login — cmd_login() returns None and the script just exits 0 either way.
// So the login subprocess's exit status can't tell us whether login
// actually succeeded; checking for a real clerk_token in the config file
// it writes to is the only reliable signal.
function hasClerkToken(configPath) {
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    return typeof cfg.clerk_token === "string" && cfg.clerk_token.length > 0;
  } catch {
    return false;
  }
}

module.exports = { hasClerkToken };
