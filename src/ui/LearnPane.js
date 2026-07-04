import React from 'react';
import { Box, Text } from 'ink';

const DIM = '#74849e';
const BRIGHT = '#e9f1fc';
const GREEN = '#36e85a';

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

export default function LearnPane({ suspended = false }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (suspended) return undefined;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % BLURBS.length);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [suspended]);

  const blurb = BLURBS[index];

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { color: GREEN, bold: true }, 'Learn'),
    React.createElement(Text),
    React.createElement(Text, { color: BRIGHT, bold: true }, blurb.heading),
    ...blurb.lines.map((line, i) =>
      React.createElement(Text, { key: `line-${i}`, color: DIM }, line)
    )
  );
}
