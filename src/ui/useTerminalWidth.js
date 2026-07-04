import { useEffect, useState } from 'react';

// process.stdout.columns is undefined on non-TTY stdout (piped output, some
// CI runners) — fall back to a sane default rather than crashing layout math.
const DEFAULT_WIDTH = 80;

export function useTerminalWidth() {
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
