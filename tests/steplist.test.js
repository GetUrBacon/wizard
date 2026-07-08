import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import figures from 'figures';
import StepList from '../dist/ui/StepList.js';

function makeStep(overrides) {
  return {
    n: 1,
    label: 'Install plugin',
    status: 'pending',
    activeLabel: undefined,
    message: undefined,
    notes: [],
    ...overrides,
  };
}

test('pending step renders the open-square marker and its label, no check/X', () => {
  const steps = [makeStep({ status: 'pending', label: 'Install plugin' })];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();

  assert.ok(frame.includes('◻'));
  assert.ok(frame.includes('Install plugin'));
  assert.ok(!frame.includes(figures.tick));
  assert.ok(!frame.includes(figures.cross));
});

// The running row used to show an @inkjs/ui Spinner (a setInterval-driven
// animation); it now renders a static '▶' glyph instead (see StepList.jsx's
// header comment — this removes an interval-driven re-render that was
// implicated in a confirmed redraw-tearing bug), so no unmount()-in-finally
// dance is needed here anymore.
test('running step renders the static triangle glyph and activeLabel/label', () => {
  const steps = [
    makeStep({ status: 'running', label: 'Install plugin', activeLabel: 'Installing plugin…' }),
  ];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();
  assert.ok(frame.includes('▶'));
  assert.ok(frame.includes('Installing plugin…'));
});

test('running step falls back to label when activeLabel is unset', () => {
  const steps = [makeStep({ status: 'running', label: 'Install plugin' })];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();
  assert.ok(frame.includes('▶'));
  assert.ok(frame.includes('Install plugin'));
});

test('ok step renders a filled square and the step message', () => {
  const steps = [makeStep({ status: 'ok', message: 'Plugin already installed' })];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();

  assert.ok(frame.includes('◼'));
  assert.ok(frame.includes('Plugin already installed'));
});

test('fail step renders an X mark and the step message', () => {
  const steps = [makeStep({ status: 'fail', message: 'Plugin install failed' })];
  const { lastFrame } = render(React.createElement(StepList, { steps, total: 1 }));
  const frame = lastFrame();

  assert.ok(frame.includes(figures.cross));
  assert.ok(frame.includes('Plugin install failed'));
});

// General regression guard: since StepList re-renders the full list live on
// every step transition (no <Static> — see the comment on the default export
// below for why), nothing about that should ever cause the heading or an
// already-finished row's message to appear more than once as steps complete.
test('heading appears exactly once and no row duplicates as steps complete in n-order', () => {
  const labels = ['Install plugin', 'Connect account', 'Verify setup'];
  let steps = labels.map((label, i) => ({
    n: i + 1,
    label,
    status: 'pending',
    activeLabel: undefined,
    message: undefined,
    notes: [],
  }));

  const { lastFrame, rerender } = render(
    React.createElement(StepList, { steps, total: steps.length })
  );

  function assertSingleOccurrences(frame, needles) {
    for (const needle of needles) {
      const first = frame.indexOf(needle);
      assert.ok(first !== -1, `expected frame to contain "${needle}"`);
      const second = frame.indexOf(needle, first + needle.length);
      assert.equal(second, -1, `expected "${needle}" to appear exactly once`);
    }
  }

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

  // Mirror useWizardSteps.js: each step transitions pending -> ok in n-order.
  for (let i = 0; i < steps.length; i++) {
    const n = i + 1;
    const message = `${labels[i]} done`;
    steps = steps.map((step) => (step.n === n ? { ...step, status: 'ok', message } : step));

    rerender(React.createElement(StepList, { steps, total: steps.length }));
    const frame = lastFrame();

    assert.equal(countOccurrences(frame, 'Tasks'), 1, `Tasks heading must appear exactly once after step ${n} completes`);

    // No label or message from any already-finished step should be duplicated
    // in the frame (which would happen if the heading — or a finished row —
    // were re-flushed into the live region on every rerender).
    const finishedMessages = labels.slice(0, n).map((label) => `${label} done`);
    assertSingleOccurrences(frame, finishedMessages);
  }
});
