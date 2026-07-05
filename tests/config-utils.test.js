import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// config-utils.cjs is plain CJS with no side effects at require-time (unlike
// wizard.cjs, which calls main() as soon as it's loaded) — safe to require
// directly here.
const require = createRequire(import.meta.url);
const { hasClerkToken } = require('../bin/config-utils.cjs');

function withTempConfig(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bacon-config-utils-'));
  const configPath = join(dir, 'config.json');
  if (content !== undefined) writeFileSync(configPath, content);
  try {
    return fn(configPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('true when config has a real clerk_token', () => {
  withTempConfig(JSON.stringify({ clerk_token: 'abc123' }), (configPath) => {
    assert.equal(hasClerkToken(configPath), true);
  });
});

test('false when clerk_token is missing', () => {
  withTempConfig(JSON.stringify({ active: true }), (configPath) => {
    assert.equal(hasClerkToken(configPath), false);
  });
});

test('false when clerk_token is an empty string', () => {
  withTempConfig(JSON.stringify({ clerk_token: '' }), (configPath) => {
    assert.equal(hasClerkToken(configPath), false);
  });
});

test('false when the config file does not exist', () => {
  withTempConfig(undefined, (configPath) => {
    assert.equal(hasClerkToken(configPath), false);
  });
});

test('false when the config file is not valid JSON', () => {
  withTempConfig('not json', (configPath) => {
    assert.equal(hasClerkToken(configPath), false);
  });
});
