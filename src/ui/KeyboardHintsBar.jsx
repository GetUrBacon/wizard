import React from 'react';
import { Box, Text } from 'ink';
import { MUTED } from './theme.js';

// A fixed-height (1 row) hints bar shown at the bottom of a screen. Always
// renders the Box slot even when there are no hints so the layout above it
// never jumps depending on whether hints are present.
export default function KeyboardHintsBar({ hints = [] }) {
  return (
    <Box height={1} paddingX={1}>
      {hints.length > 0 && (
        <Box flexDirection="row">
          {hints.map((hint, index) => (
            <Box
              key={hint.label + hint.action}
              flexDirection="row"
              marginRight={index === hints.length - 1 ? 0 : 2}
            >
              <Text bold color={MUTED}>
                {hint.label}
              </Text>
              <Text> </Text>
              <Text dimColor>{hint.action}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
