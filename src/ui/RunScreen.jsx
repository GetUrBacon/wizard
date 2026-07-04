import React from 'react';
import { Box } from 'ink';
import LearnPane from './LearnPane.js';
import StepList from './StepList.js';

// Two-column split for the run stage: Learn (left) + Tasks (right), the same
// 50/50 flex pattern PostHog's own SplitView primitive uses. bacon-wizard's
// flow has no long-running agent step to fill the Learn pane with live data
// (unlike PostHog's own analytics), so it cycles real product facts instead
// — see LearnPane.js.
export default function RunScreen({ steps, total, suspended }) {
  return (
    <Box flexDirection="row" gap={3}>
      <Box width="50%" flexDirection="column">
        <LearnPane suspended={suspended} />
      </Box>
      <Box width="50%" flexDirection="column">
        <StepList steps={steps} total={total} suspended={suspended} />
      </Box>
    </Box>
  );
}
