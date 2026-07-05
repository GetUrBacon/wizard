// Regression test for NO_COLOR support. chalk's color-level detection runs
// once at first import, so NO_COLOR must be set before anything (Ink, this
// file's own imports) has a chance to import chalk — and this test must
// stay in its own file: node --test runs each `tests/*.test.js` file in its
// own process, so this can't leak into (or be leaked into by) any other
// test file that imports Ink components without NO_COLOR set.
process.env.NO_COLOR = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import StepList from '../dist/ui/StepList.js';

const ANSI_ESCAPE = /\x1b\[[0-9;]*m/;

test('NO_COLOR strips ANSI color codes from rendered output', () => {
  const steps = [
    { n: 1, label: 'Install plugin', status: 'ok', message: 'Done', notes: [] },
  ];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();

  assert.ok(frame.includes('Done'));
  assert.ok(!ANSI_ESCAPE.test(frame), 'expected no ANSI color escapes with NO_COLOR set');
});
