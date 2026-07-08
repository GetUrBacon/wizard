import React from 'react';
import { Box } from 'ink';
import { useTerminalWidth, TerminalWidthProvider } from './useTerminalWidth.js';

// The width clamp itself is now provided by TerminalWidthProvider (in
// useTerminalWidth.js) so every descendant component that calls
// useTerminalWidth() sees the identical clamped value. This file's own job
// is now just to render a Box at that shared width. Width is left-aligned
// (not centered) since no existing centering logic exists elsewhere in this
// codebase. Height budgeting is intentionally NOT enforced here (advisory
// only) because StepList.jsx has documented history of redraw/tearing bugs
// tied to output-height edge cases near terminal row count -- adding new
// height-driven clipping logic here would need the same rigorous PTY-capture
// verification used to diagnose that bug, which is out of scope for this
// component.
function ScreenContainerInner({ children }) {
  const width = useTerminalWidth();

  return (
    <Box width={width} flexDirection="column">
      {children}
    </Box>
  );
}

export default function ScreenContainer({ children }) {
  return (
    <TerminalWidthProvider>
      <ScreenContainerInner>{children}</ScreenContainerInner>
    </TerminalWidthProvider>
  );
}
