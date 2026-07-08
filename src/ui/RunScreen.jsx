import React from 'react';
import { Box } from 'ink';
import LearnPane from './LearnPane.js';
import StepList from './StepList.js';
import TabContainer from './TabContainer.js';
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
//
// `pickerNode`, when provided (while an Ask* prompt from src/ui/Prompts.jsx
// is open), renders below StepList in the right pane — so completed/running
// step progress stays visible while the user answers a prompt, instead of
// being replaced by it. LearnPane keeps rendering throughout.
//
// StepList is ALWAYS rendered and ALWAYS visible here (never conditionally
// swapped out for, or hidden behind, pickerNode). It used to be hidden via
// `display: 'none'` while a picker was open — a workaround for a since-fixed
// bug where swapping `pickerNode ?? <StepList>` at the same JSX position
// unmounted StepList on every picker open, which broke <Static>'s internal
// flush-tracking (re-flushing the whole finished-steps array to scrollback
// each time). StepList has since dropped <Static> entirely (see its default
// export's doc comment), removing that failure mode, so there's no longer
// any reason to hide the list while a picker is open — showing it is what
// users actually want (visible progress while answering a prompt).
export default function RunScreen({ steps, total, pickerNode }) {
  const width = useTerminalWidth();
  const isNarrow = width < 80;

  return (
    <TabContainer steps={steps}>
      <Box flexDirection={isNarrow ? 'column' : 'row'} gap={isNarrow ? 1 : 3}>
        <Box width={isNarrow ? undefined : '50%'} flexDirection="column">
          <LearnPane />
        </Box>
        <Box width={isNarrow ? undefined : '50%'} flexDirection="column">
          <StepList steps={steps} total={total} />
          {pickerNode}
        </Box>
      </Box>
    </TabContainer>
  );
}
