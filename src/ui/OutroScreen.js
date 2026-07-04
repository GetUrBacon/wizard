import React from 'react';
import { Box, Text } from 'ink';

const GREEN = '#36e85a';
const DIM = '#74849e';
const BRIGHT = '#e9f1fc';
const WARN = '#f5a623';
const MONO = '#8a9bb5';

// Ink port of the old plain-print()-based showDone() — same content, same
// order, rendered as the final stage of the persistent Ink tree instead of
// a separate print block after Ink unmounts.
export default function OutroScreen({ loggedIn }) {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text),
    React.createElement(Text, { color: DIM }, '  ' + '─'.repeat(48)),
    React.createElement(Text),
    React.createElement(Text, { color: GREEN }, '  ✓ Bacon is set up!'),
    React.createElement(Text),
    loggedIn
      ? React.createElement(
          Box,
          null,
          React.createElement(Text, { color: BRIGHT }, '  Dashboard →  '),
          React.createElement(Text, { color: MONO }, 'https://geturbacon.dev/dashboard')
        )
      : React.createElement(
          Box,
          null,
          React.createElement(Text, { color: WARN }, '  → Connect later:  '),
          React.createElement(Text, { color: MONO }, 'bacon-setup login')
        ),
    React.createElement(Text),
    React.createElement(Text, { color: DIM }, '  Ads appear occasionally in Claude Code.'),
    React.createElement(Text, { color: DIM }, '  Your prompts never leave your machine.'),
    React.createElement(Text),
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: DIM }, '  configure  '),
      React.createElement(Text, { color: MONO }, 'bacon-config show')
    ),
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: DIM }, '  pause     '),
      React.createElement(Text, { color: MONO }, 'bacon-config pause')
    ),
    React.createElement(Text),
    React.createElement(Text, { color: DIM }, '  ' + '─'.repeat(48)),
    React.createElement(Text)
  );
}
