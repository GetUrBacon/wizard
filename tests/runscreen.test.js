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

// Both panes now have the same shape — a heading line, a blank line, then
// content (StepList dropped <Static> entirely, see its default export's
// doc comment, so "Tasks" is plain live content symmetric with "Learn") —
// so comparing the two headings directly is the simplest layout check.

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
  const tasksLine = lineIndexOf(frame, 'Tasks');

  assert.ok(learnLine !== -1, 'expected "Learn" heading to render');
  assert.ok(tasksLine !== -1, 'expected "Tasks" heading to render');
  assert.notEqual(learnLine, tasksLine, 'expected Learn and Tasks on separate (stacked) lines');
  assert.ok(learnLine < tasksLine, 'expected Learn above Tasks when stacked');
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
  const tasksLine = lineIndexOf(frame, 'Tasks');

  assert.ok(learnLine !== -1, 'expected "Learn" heading to render');
  assert.ok(tasksLine !== -1, 'expected "Tasks" heading to render');
  assert.equal(learnLine, tasksLine, 'expected Learn and Tasks sharing a row when side-by-side');
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
// same JSX position, which unmounted StepList every time a picker opened
// and mounted a brand-new one when it closed. Back when StepList used
// <Static> for completed rows, that remount destroyed Static's internal
// flush-tracking, causing it to re-flush the entire finished-steps array
// from scratch each time — duplicating every already-completed row once
// per picker open/close cycle (login confirm + 3 preference prompts in the
// real flow). StepList no longer uses <Static> at all (see its default
// export's doc comment), which removes that specific failure mode — but
// StepList must still stay mounted (hidden via `display: none`) rather than
// unmounted while a picker is open, so this guards the general behavior.
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
  // Step 1 ("Plugin installed") is not the latest step, so it only ever
  // renders once, in StepList's own row.
  assert.equal(countOccurrences(frame, 'Plugin installed'), 1, 'finished step message must not duplicate');
  // Step 2 ("Account connected") is the latest step, so — now that RunScreen
  // wraps its content in TabContainer (see RunScreen.jsx) — it legitimately
  // renders twice: once in StepList's own row, once more in TabContainer's
  // persistent status line below the rule. That's intended, not a
  // regression of the duplicate-flush bug this test otherwise guards
  // against (Tasks still appears exactly once above).
  assert.equal(countOccurrences(frame, 'Account connected'), 2, 'latest step message should appear once in StepList and once in the TabContainer status line');
});
