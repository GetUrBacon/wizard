import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { SUCCESS, MUTED, PRIMARY, WARNING, LINK } from './theme.js';

// Ink port of the old plain-print()-based showDone() — same content, same
// order, rendered as the final stage of the persistent Ink tree instead of
// a separate print block after Ink unmounts.
export default function OutroScreen({ loggedIn }) {
  return (
    <Box flexDirection="column">
      <Text />
      <Text color={MUTED}>{'  ' + '─'.repeat(48)}</Text>
      <Text />
      <Text color={SUCCESS}>  {figures.tick} Bacon is set up!</Text>
      <Text />
      {loggedIn ? (
        <Box>
          <Text color={PRIMARY}>  Dashboard →  </Text>
          <Text color={LINK}>https://geturbacon.dev/dashboard</Text>
        </Box>
      ) : (
        <Box>
          <Text color={WARNING}>  → Connect later:  </Text>
          <Text color={LINK}>bacon-setup login</Text>
        </Box>
      )}
      <Text />
      <Text color={MUTED}>  Ads appear occasionally in Claude Code.</Text>
      <Text color={MUTED}>  Your prompts never leave your machine.</Text>
      <Text />
      <Box>
        <Text color={MUTED}>  configure  </Text>
        <Text color={LINK}>bacon-config show</Text>
      </Box>
      <Box>
        <Text color={MUTED}>  pause     </Text>
        <Text color={LINK}>bacon-config pause</Text>
      </Box>
      <Text />
      <Text color={MUTED}>{'  ' + '─'.repeat(48)}</Text>
      <Text />
    </Box>
  );
}
