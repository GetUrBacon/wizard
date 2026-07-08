import React, { createContext, useContext, useEffect, useState } from 'react';

// process.stdout.columns is undefined on non-TTY stdout (piped output, some
// CI runners) — fall back to a sane default rather than crashing layout math.
const DEFAULT_WIDTH = 80;

// Internal, unexported: reads the raw (unclamped) terminal width and
// subscribes to resize events. Not exported directly — components should
// go through useTerminalWidth() below so they pick up the shared clamped
// value when rendered under a TerminalWidthProvider.
function useRawTerminalWidth() {
  const [width, setWidth] = useState(process.stdout.columns || DEFAULT_WIDTH);

  useEffect(() => {
    const onResize = () => setWidth(process.stdout.columns || DEFAULT_WIDTH);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return width;
}

// Module-scope context, not exported — nothing outside this file needs to
// reference the context object directly, only the hook and the provider
// below.
const TerminalWidthContext = createContext(null);

// This is the single place that clamps terminal width to a maximum of 120
// columns (matching PostHog wizard's layout convention). It intentionally
// does NOT floor a narrow terminal upward -- Math.min(120, raw) alone
// already leaves any raw width below 120 untouched, so narrow-terminal
// layout logic elsewhere (e.g. RunScreen's isNarrow check) keeps seeing the
// real, unmodified width.
export function TerminalWidthProvider({ children }) {
  const raw = useRawTerminalWidth();
  const clamped = Math.min(120, raw);
  return React.createElement(TerminalWidthContext.Provider, { value: clamped }, children);
}

// raw is always read (Rules of Hooks require the hook call regardless of
// whether its result ends up used), but when this hook is called from a
// component nested under a TerminalWidthProvider (i.e. under
// ScreenContainer), it returns the shared clamped value instead -- this is
// what keeps HeaderBar.jsx and RunScreen.jsx's own useTerminalWidth() calls
// in sync with ScreenContainer's Box width with zero changes needed in
// those two files. When there is no TerminalWidthProvider ancestor (e.g. a
// component rendered standalone in a test), it transparently falls back to
// the raw value exactly as before.
export function useTerminalWidth() {
  const raw = useRawTerminalWidth();
  const ctx = useContext(TerminalWidthContext);
  return ctx !== null ? ctx : raw;
}
