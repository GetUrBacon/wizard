import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import HeaderBar from '../dist/ui/HeaderBar.js';

test('HeaderBar renders left and right text in order', () => {
  const { lastFrame } = render(React.createElement(HeaderBar, { left: 'Foo', right: 'Bar' }));
  const frame = lastFrame();

  assert.ok(frame.includes('Foo'));
  assert.ok(frame.includes('Bar'));
  assert.ok(frame.indexOf('Foo') < frame.indexOf('Bar'));
});
