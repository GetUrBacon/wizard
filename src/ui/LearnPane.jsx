import React from 'react';
import { Box, Text } from 'ink';
import { DIM, BRIGHT, GREEN } from './theme.js';

// Real facts about the Bacon ad network — not fabricated data. Unlike
// PostHog's Learn deck (which visualizes the user's own product analytics),
// bacon-wizard has no live data to show during its short install flow, so
// this teaches how the product actually works instead of faking a chart.
const BLURBS = [
  {
    heading: 'How it works',
    lines: [
      'A sponsored word or link appears occasionally in Claude',
      "Code's replies, statusline, or thinking indicator.",
    ],
  },
  {
    heading: 'Frequency tiers',
    lines: [
      'Minimal ~$0.40/mo (1 per 20 prompts) up to Every prompt',
      '~$7.50/mo — you pick the tier in the next step.',
    ],
  },
  {
    heading: 'Privacy',
    lines: [
      'Your prompts, code, and API keys are never shared.',
      'Personalization (optional) only ever sees your stack.',
    ],
  },
  {
    heading: 'Revenue share',
    lines: [
      'Ad revenue is paid out to you — check your balance any',
      'time with `bacon-earnings`.',
    ],
  },
];

const ROTATE_MS = 4000;

export default function LearnPane() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % BLURBS.length);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, []);

  const blurb = BLURBS[index];

  return (
    <Box flexDirection="column">
      <Text color={GREEN} bold>
        Learn
      </Text>
      <Text />
      <Text color={BRIGHT} bold>
        {blurb.heading}
      </Text>
      {blurb.lines.map((line, i) => (
        <Text key={`line-${i}`} color={DIM}>
          {line}
        </Text>
      ))}
    </Box>
  );
}
