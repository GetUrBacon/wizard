import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import Banner from '../dist/ui/Banner.js';

test('Banner renders default tagline, wizard label, and dim rule', () => {
  const { lastFrame } = render(React.createElement(Banner));
  const frame = lastFrame();

  assert.ok(frame.includes('setup wizard'));
  assert.ok(frame.includes('get paid to code'));
  assert.ok(frame.includes('─'.repeat(48)));
});

test('Banner renders a custom tagline instead of the default', () => {
  const { lastFrame } = render(React.createElement(Banner, { tagline: 'a custom tagline' }));
  const frame = lastFrame();

  assert.ok(frame.includes('a custom tagline'));
  assert.ok(!frame.includes('get paid to code'));
});
