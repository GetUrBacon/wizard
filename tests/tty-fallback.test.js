// bin/wizard.cjs's TTY check can't be exercised through ink-testing-library
// (it doesn't simulate real TTY-ness) — this needs a real subprocess with
// both stdin and stdout piped, which makes neither a TTY.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIZARD_BIN = join(__dirname, '..', 'bin', 'wizard.cjs');

test('exits immediately with a clear message when stdin/stdout are not a TTY', async () => {
  const child = spawn(process.execPath, [WIZARD_BIN], { stdio: 'pipe' });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.end();

  const [code] = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode) => resolve([exitCode]));
  });

  assert.equal(code, 1);
  assert.ok(stderr.includes('requires an interactive terminal'));
});
