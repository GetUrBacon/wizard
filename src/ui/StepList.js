import React from 'react';
import { Box, Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function Spinner() {
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return React.createElement(Text, { color: '#e9f1fc' }, SPINNER_FRAMES[frameIndex]);
}

function StepRow({ step, total }) {
  const statusRow = (() => {
    switch (step.status) {
      case 'pending':
        return React.createElement(
          Box,
          null,
          React.createElement(Text, { color: '#74849e' }, '  · '),
          React.createElement(Text, { color: '#74849e' }, step.label)
        );
      case 'running':
        return React.createElement(
          Box,
          null,
          React.createElement(Text, null, '  '),
          React.createElement(Spinner),
          React.createElement(Text, null, ' '),
          React.createElement(Text, { color: '#e9f1fc' }, step.activeLabel ?? step.label)
        );
      case 'ok':
        return React.createElement(
          Box,
          null,
          React.createElement(Text, { color: '#36e85a' }, '  ✓ '),
          React.createElement(Text, null, step.message)
        );
      case 'fail':
        return React.createElement(
          Box,
          null,
          React.createElement(Text, { color: '#e85a5a' }, '  ✗ '),
          React.createElement(Text, null, step.message)
        );
      default:
        return null;
    }
  })();

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: '#74849e' }, `[${step.n}/${total}] `),
      React.createElement(Text, { color: '#e9f1fc' }, step.label)
    ),
    statusRow,
    step.notes.map((note, index) =>
      React.createElement(
        Box,
        { key: `note-${step.n}-${index}` },
        React.createElement(Text, { color: '#74849e' }, '    · '),
        React.createElement(Text, { color: '#74849e' }, note)
      )
    )
  );
}

export default function StepList({ steps, total }) {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    steps.map((step) => React.createElement(StepRow, { key: step.n, step, total }))
  );
}
