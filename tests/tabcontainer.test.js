import test from 'node:test';
import assert from 'node:assert/strict';
import { getLatestStatusLine } from '../dist/ui/TabContainer.js';

test('empty steps array returns null', () => {
  assert.equal(getLatestStatusLine([]), null);
});

test('all steps pending returns null', () => {
  const steps = [
    { n: 1, label: 'First', status: 'pending', activeLabel: undefined, message: undefined, notes: [] },
    { n: 2, label: 'Second', status: 'pending', activeLabel: undefined, message: undefined, notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), null);
});

test('running step with activeLabel returns activeLabel', () => {
  const steps = [
    { n: 1, label: 'Install', status: 'running', activeLabel: 'Installing…', message: undefined, notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Installing…');
});

test('running step without activeLabel falls back to label', () => {
  const steps = [
    { n: 1, label: 'Install', status: 'running', activeLabel: undefined, message: undefined, notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Install');
});

test('ok step with message returns message', () => {
  const steps = [
    { n: 1, label: 'Install', status: 'ok', activeLabel: undefined, message: 'Installed successfully', notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Installed successfully');
});

test('ok step without message falls back to label', () => {
  const steps = [
    { n: 1, label: 'Install', status: 'ok', activeLabel: undefined, message: undefined, notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Install');
});

test('fail step with message returns message', () => {
  const steps = [
    { n: 1, label: 'Install', status: 'fail', activeLabel: undefined, message: 'Install failed', notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Install failed');
});

test('skips trailing pending step and returns lower-n non-pending step', () => {
  const steps = [
    { n: 1, label: 'First', status: 'ok', activeLabel: undefined, message: 'Done first', notes: [] },
    { n: 2, label: 'Second', status: 'pending', activeLabel: undefined, message: undefined, notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Done first');
});

test('picks step with numerically highest n regardless of array order', () => {
  const steps = [
    { n: 3, label: 'Third', status: 'ok', activeLabel: undefined, message: 'Done third', notes: [] },
    { n: 1, label: 'First', status: 'ok', activeLabel: undefined, message: 'Done first', notes: [] },
    { n: 2, label: 'Second', status: 'ok', activeLabel: undefined, message: 'Done second', notes: [] },
  ];
  assert.equal(getLatestStatusLine(steps), 'Done third');
});
