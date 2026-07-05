import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { AskConfirm, AskSelect, AskMultiSelect } from '../dist/ui/Prompts.js';

const ENTER = '\r';
const ESCAPE = '';
const SPACE = ' ';

// useInput's raw-mode setup (setRawMode(true) + the 'readable' listener
// that feeds it) runs in a useEffect, scheduled asynchronously after the
// initial render — writing to stdin immediately after render() races that
// setup and is silently dropped (no listener attached yet). A short wait
// after render (and after each write, before reading the result) lets
// those effects flush first.
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test('AskConfirm: "y" confirms', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskConfirm, {
      message: 'Open the browser?',
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  stdin.write('y');
  await wait();
  unmount();
  assert.equal(result, true);
});

test('AskConfirm: Escape cancels', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskConfirm, {
      message: 'Open the browser?',
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  stdin.write(ESCAPE);
  await wait();
  unmount();
  assert.equal(result, 'CANCELLED');
});

// @inkjs/ui's Select always visually focuses options[0] on mount (verified
// against its source — see the comment on AskSelect in src/ui/Prompts.jsx),
// so the "default" option must be first in the list, and there's no
// separate defaultValue prop to pass.
test('AskSelect: Enter submits the first (default) option', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskSelect, {
      message: 'How often should ads appear?',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'max', label: 'Max' },
      ],
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  stdin.write(ENTER);
  await wait();
  unmount();
  assert.equal(result, 'standard');
});

test('AskSelect: Escape cancels', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskSelect, {
      message: 'How often should ads appear?',
      options: [{ value: 'standard', label: 'Standard' }],
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  stdin.write(ESCAPE);
  await wait();
  unmount();
  assert.equal(result, 'CANCELLED');
});

test('AskMultiSelect: space toggles, Enter submits', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskMultiSelect, {
      message: 'Where can ads appear?',
      options: [
        { value: 'inreply', label: 'In replies' },
        { value: 'statusline', label: 'Statusline' },
      ],
      initialValues: ['inreply'],
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  // Toggle the focused (first, "inreply") option off, then submit.
  stdin.write(SPACE);
  await wait();
  stdin.write(ENTER);
  await wait();
  unmount();
  assert.deepEqual(result, []);
});

test('AskMultiSelect: Escape cancels', async () => {
  let result;
  const { stdin, unmount } = render(
    React.createElement(AskMultiSelect, {
      message: 'Where can ads appear?',
      options: [{ value: 'inreply', label: 'In replies' }],
      initialValues: ['inreply'],
      onSubmit: (v) => { result = v; },
      onCancel: () => { result = 'CANCELLED'; },
    })
  );
  await wait();
  stdin.write(ESCAPE);
  await wait();
  unmount();
  assert.equal(result, 'CANCELLED');
});
