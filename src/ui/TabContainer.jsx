import React from 'react';
import { Box, Text } from 'ink';
import { SUCCESS, MUTED } from './theme.js';
import { useTerminalWidth } from './useTerminalWidth.js';

// Finds the status line to show below the rule: the most recently
// started/updated step (highest `n` that isn't still 'pending'). While
// that step is 'running' we show its in-progress label (activeLabel,
// falling back to label); once it's settled (ok/fail/anything else) we
// show its message, falling back to label. Returns null when every step
// is still pending, so the caller can omit the line entirely.
export function getLatestStatusLine(steps) {
  let latest = null;

  for (const step of steps) {
    if (step.status === 'pending') continue;
    if (latest === null || step.n > latest.n) {
      latest = step;
    }
  }

  if (latest === null) return null;

  if (latest.status === 'running') {
    return latest.activeLabel ?? latest.label;
  }

  return latest.message ?? latest.label;
}

// Wraps the run screen's content with a persistent single-tab bar below
// it. Ink v5's support for a border on only one side (e.g. borderTop) is
// uncertain, so — matching the proven technique already used for rules in
// OutroScreen.jsx (a MUTED Text containing a repeated '─' character,
// `'  ' + '─'.repeat(48)`) — draw the separator as plain Text instead of
// relying on Box border props. Unlike OutroScreen.jsx (a separate, unrelated
// file whose own hardcoded '─'.repeat(48) rules are intentionally left
// unchanged), this rule now scales with the current available width via
// useTerminalWidth() instead of a fixed 48 characters, so it looks
// proportional whether the terminal/container is narrow or up to 120
// columns wide.
export default function TabContainer({ steps = [], children }) {
  const statusLine = getLatestStatusLine(steps);
  const width = useTerminalWidth();
  const ruleWidth = Math.max(0, width - 2);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
      <Text color={MUTED}>{'  ' + '─'.repeat(ruleWidth)}</Text>
      {statusLine !== null ? (
        <Box>
          <Text color={MUTED}>{'◆ '}</Text>
          <Text color={MUTED}>{statusLine}</Text>
        </Box>
      ) : null}
      <Box>
        <Text inverse bold color={SUCCESS}>
          {' Status '}
        </Text>
      </Box>
    </Box>
  );
}
