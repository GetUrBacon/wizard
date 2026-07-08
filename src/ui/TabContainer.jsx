import React from 'react';
import { Box, Text } from 'ink';
import { SUCCESS, MUTED } from './theme.js';

// Finds the status line to show below the rule: the most recently
// started/updated step (highest `n` that isn't still 'pending'). While
// that step is 'running' we show its in-progress label (activeLabel,
// falling back to label); once it's settled (ok/fail/anything else) we
// show its message, falling back to label. Returns null when every step
// is still pending, so the caller can omit the line entirely.
function getLatestStatusLine(steps) {
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
// relying on Box border props.
export default function TabContainer({ steps = [], children }) {
  const statusLine = getLatestStatusLine(steps);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
      <Text color={MUTED}>{'  ' + '─'.repeat(48)}</Text>
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
