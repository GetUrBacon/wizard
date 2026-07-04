import React from 'react';
import { Text } from 'ink';
import { useTerminalWidth } from './useTerminalWidth.js';
import { GREEN, DARK } from './theme.js';

// A single-color header bar present on every screen (intro/run/outro), the
// way PostHog's wizard keeps its orange bar mounted throughout. Built as ONE
// Text spanning the full width rather than a Box with left/right children —
// Ink's Box has no backgroundColor prop (only Text does), so a Box-based bar
// would leave the gap between left/right text uncolored, breaking the solid
// look this is going for.
export default function HeaderBar({ left, right }) {
  const width = useTerminalWidth();
  const gap = Math.max(1, width - left.length - right.length);
  const line = (left + ' '.repeat(gap) + right).slice(0, width);

  return (
    <Text backgroundColor={GREEN} color={DARK} bold>
      {line}
    </Text>
  );
}
