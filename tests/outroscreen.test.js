import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import OutroScreen from '../dist/ui/OutroScreen.js';

test('OutroScreen shows dashboard link when logged in', () => {
  const { lastFrame } = render(React.createElement(OutroScreen, { loggedIn: true }));
  const frame = lastFrame();

  assert.ok(frame.includes('Bacon is set up'));
  assert.ok(frame.includes('https://geturbacon.dev/dashboard'));
});

test('OutroScreen shows login hint and no dashboard link when logged out', () => {
  const { lastFrame } = render(React.createElement(OutroScreen, { loggedIn: false }));
  const frame = lastFrame();

  assert.ok(frame.includes('bacon-setup login'));
  assert.ok(!frame.includes('https://geturbacon.dev/dashboard'));
});
