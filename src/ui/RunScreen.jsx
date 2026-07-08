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
// `pickerNode`, when provided, visually covers StepList in the right pane —
// used while an Ask* prompt (see src/ui/Prompts.jsx) needs the space step
// 5's row would otherwise occupy. LearnPane keeps rendering throughout.
//
// StepList is ALWAYS rendered here (never conditionally swapped out for
// pickerNode) — confirmed as a real bug in production: swapping between
// `pickerNode` and `<StepList>` at the same JSX position via `??` made
// React unmount StepList every time a picker opened, which destroys
// <Static>'s internal flush-tracking (see StepList.jsx). On remount,
// <Static> treats the entire current `finished` array as brand-new and
// re-flushes all of it to permanent scrollback again — once per picker
// (login confirm + 3 preference prompts), so real runs printed the whole
// step list 3+ times over. Hiding via `display: 'none'` instead of
// unmounting keeps StepList (and Static's tracking) alive for the whole
// run; only its visibility toggles.
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
          <Box display={pickerNode ? 'none' : 'flex'} flexDirection="column">
            <StepList steps={steps} total={total} />
          </Box>
          {pickerNode}
        </Box>
      </Box>
    </TabContainer>
  );
}
