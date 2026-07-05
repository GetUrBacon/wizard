import React from 'react';
import { Box } from 'ink';
import LearnPane from './LearnPane.js';
import StepList from './StepList.js';
import { useTerminalWidth } from './useTerminalWidth.js';

// Two-column split for the run stage: Learn (left) + Tasks (right), the same
// 50/50 flex pattern PostHog's own SplitView primitive uses. bacon-wizard's
// flow has no long-running agent step to fill the Learn pane with live data
// (unlike PostHog's own analytics), so it cycles real product facts instead
// — see LearnPane.js.
//
// Below 80 columns the two 50%-width panes get too narrow to read, so stack
// them full-width instead — Learn above, Tasks below. Nothing is hidden;
// this matches the rest of the app's preference for showing full detail
// (notes, addNote calls) over dropping content on narrow terminals.
// `pickerNode`, when provided, replaces StepList in the right pane — used
// while an Ask* prompt (see src/ui/Prompts.jsx) needs the space step 5's
// row would otherwise occupy. LearnPane keeps rendering throughout; only
// the right pane swaps.
export default function RunScreen({ steps, total, pickerNode }) {
  const width = useTerminalWidth();
  const isNarrow = width < 80;

  return (
    <Box flexDirection={isNarrow ? 'column' : 'row'} gap={isNarrow ? 1 : 3}>
      <Box width={isNarrow ? undefined : '50%'} flexDirection="column">
        <LearnPane />
      </Box>
      <Box width={isNarrow ? undefined : '50%'} flexDirection="column">
        {pickerNode ?? <StepList steps={steps} total={total} />}
      </Box>
    </Box>
  );
}
