import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { GREEN, DIM, BRIGHT, WARN, MONO } from './theme.js';

// Ink port of the old plain-print()-based showDone() — same content, same
// order, rendered as the final stage of the persistent Ink tree instead of
// a separate print block after Ink unmounts.
export default function OutroScreen({ loggedIn }) {
  return (
    <Box flexDirection="column">
      <Text />
      <Text color={DIM}>{'  ' + '─'.repeat(48)}</Text>
      <Text />
      <Text color={GREEN}>  {figures.tick} Bacon is set up!</Text>
      <Text />
      {loggedIn ? (
        <Box>
          <Text color={BRIGHT}>  Dashboard →  </Text>
          <Text color={MONO}>https://geturbacon.dev/dashboard</Text>
        </Box>
      ) : (
        <Box>
          <Text color={WARN}>  → Connect later:  </Text>
          <Text color={MONO}>bacon-setup login</Text>
        </Box>
      )}
      <Text />
      <Text color={DIM}>  Ads appear occasionally in Claude Code.</Text>
      <Text color={DIM}>  Your prompts never leave your machine.</Text>
      <Text />
      <Box>
        <Text color={DIM}>  configure  </Text>
        <Text color={MONO}>bacon-config show</Text>
      </Box>
      <Box>
        <Text color={DIM}>  pause     </Text>
        <Text color={MONO}>bacon-config pause</Text>
      </Box>
      <Text />
      <Text color={DIM}>{'  ' + '─'.repeat(48)}</Text>
      <Text />
    </Box>
  );
}
