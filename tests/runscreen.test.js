import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import RunScreen from '../dist/ui/RunScreen.js';

const STEPS = [
  { n: 1, label: 'Install plugin', status: 'pending', activeLabel: undefined, message: undefined, notes: [] },
];

function lineIndexOf(frame, needle) {
  const lines = frame.split('\n');
  return lines.findIndex((line) => line.includes(needle));
}

// Note: deliberately comparing against StepList's live "[n/total] label" row
// ("Install plugin"), not its "Tasks" heading — "Tasks" is flushed through
// <Static>, which Ink always renders ahead of all live content regardless
// of row/column layout, so it can't be used to detect stacked-vs-side-by-side.

test('stacks Learn above Tasks on narrow terminals (<80 columns)', (t) => {
  const original = process.stdout.columns;
  process.stdout.columns = 60;
  t.after(() => { process.stdout.columns = original; });

  // LearnPane's blurb-rotation interval always runs now (no suspended
  // prop) — must unmount() or it outlives this render and keeps this test
  // file's process alive indefinitely.
  const { lastFrame, unmount } = render(
    React.createElement(RunScreen, { steps: STEPS, total: 1 })
  );
  t.after(unmount);
  const frame = lastFrame();

  const learnLine = lineIndexOf(frame, 'Learn');
  const stepLine = lineIndexOf(frame, 'Install plugin');

  assert.ok(learnLine !== -1, 'expected "Learn" heading to render');
  assert.ok(stepLine !== -1, 'expected the step row to render');
  assert.notEqual(learnLine, stepLine, 'expected Learn and the step row on separate (stacked) lines');
  assert.ok(learnLine < stepLine, 'expected Learn above the step row when stacked');
});

test('shows Learn and Tasks side-by-side on wide terminals (>=80 columns)', (t) => {
  const original = process.stdout.columns;
  process.stdout.columns = 120;
  t.after(() => { process.stdout.columns = original; });

  const { lastFrame, unmount } = render(
    React.createElement(RunScreen, { steps: STEPS, total: 1 })
  );
  t.after(unmount);
  const frame = lastFrame();

  const learnLine = lineIndexOf(frame, 'Learn');
  const stepLine = lineIndexOf(frame, 'Install plugin');

  assert.ok(learnLine !== -1, 'expected "Learn" heading to render');
  assert.ok(stepLine !== -1, 'expected the step row to render');
  assert.equal(learnLine, stepLine, 'expected Learn and the step row sharing a row when side-by-side');
});
