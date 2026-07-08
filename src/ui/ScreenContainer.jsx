import React from 'react';
import { Box } from 'ink';
import { useTerminalWidth } from './useTerminalWidth.js';

// Width is clamped to the range 80-120 columns to match PostHog wizard's
// layout convention. This is left-aligned (not centered) since no existing
// centering logic exists elsewhere in this codebase. Height budgeting is
// intentionally NOT enforced here (advisory only) because StepList.jsx has
// documented history of redraw/tearing bugs tied to output-height edge cases
// near terminal row count -- adding new height-driven clipping logic here
// would need the same rigorous PTY-capture verification used to diagnose
// that bug, which is out of scope for this component.
export default function ScreenContainer({ children }) {
  const width = useTerminalWidth();
  const clampedWidth = Math.min(120, Math.max(80, width));

  return (
    <Box width={clampedWidth} flexDirection="column">
      {children}
    </Box>
  );
}
