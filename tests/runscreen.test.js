import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Text } from 'ink';
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

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = 0;
  for (;;) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

// Regression test: RunScreen used to swap `pickerNode ?? <StepList>` at the
// same JSX position, which unmounts StepList (destroying <Static>'s flush
// tracking) every time a picker opens, and mounts a brand-new StepList when
// it closes — causing <Static> to re-flush the entire finished-steps array
// from scratch each time, duplicating every already-completed step row in
// permanent scrollback once per picker open/close cycle (login confirm +
// 3 preference prompts in the real flow). StepList must now stay mounted
// (hidden via `display: none`) the whole time a picker is open.
test('opening and closing pickerNode repeatedly does not duplicate finished step rows', () => {
  const steps = [
    { n: 1, label: 'Install plugin', status: 'ok', message: 'Plugin installed', notes: [] },
    { n: 2, label: 'Connect account', status: 'ok', message: 'Account connected', notes: [] },
  ];
  const picker = React.createElement(Text, null, 'Picker open');

  const { lastFrame, rerender, unmount } = render(
    React.createElement(RunScreen, { steps, total: steps.length })
  );

  // Simulate 3 picker open/close cycles (login confirm + 2 preference
  // prompts), same as a real run does across steps 4 and 5.
  for (let i = 0; i < 3; i++) {
    rerender(React.createElement(RunScreen, { steps, total: steps.length, pickerNode: picker }));
    rerender(React.createElement(RunScreen, { steps, total: steps.length }));
  }

  const frame = lastFrame();
  unmount();

  assert.equal(countOccurrences(frame, 'Tasks'), 1, 'Tasks heading must appear exactly once');
  assert.equal(countOccurrences(frame, 'Plugin installed'), 1, 'finished step message must not duplicate');
  assert.equal(countOccurrences(frame, 'Account connected'), 1, 'finished step message must not duplicate');
});
