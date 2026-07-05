import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import figures from 'figures';
import { GREEN, DIM, BRIGHT, FAIL } from './theme.js';

// Each row is an icon/prefix (fixed width, flexShrink: 0) next to a
// message that can wrap on its own (flexGrow: 1). The narrower half-width
// column introduced by the Learn/Tasks split makes wrapping much more
// likely than before — without flexShrink: 0 on the icon, Ink/Yoga's wrap
// calculation can eat the icon's trailing space at the wrap boundary,
// gluing it directly onto the message (e.g. "✓Plugin already installed").
function PendingRow({ step }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={DIM}>  · </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={DIM}>{step.label}</Text>
      </Box>
    </Box>
  );
}

function RunningRow({ step }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text>  </Text>
        <InkSpinner />
        <Text> </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={BRIGHT}>{step.activeLabel ?? step.label}</Text>
      </Box>
    </Box>
  );
}

function OkRow({ step }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={GREEN}>  {figures.tick} </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{step.message}</Text>
      </Box>
    </Box>
  );
}

function FailRow({ step }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={FAIL}>  {figures.cross} </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{step.message}</Text>
      </Box>
    </Box>
  );
}

const STATUS_ROWS = {
  pending: PendingRow,
  running: RunningRow,
  ok: OkRow,
  fail: FailRow,
};

function StepRow({ step, total }) {
  const StatusRow = STATUS_ROWS[step.status];

  return (
    <React.Fragment>
      <Box>
        <Box flexShrink={0}>
          <Text color={DIM}>{`[${step.n}/${total}] `}</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={BRIGHT}>{step.label}</Text>
        </Box>
      </Box>
      {StatusRow ? <StatusRow step={step} /> : null}
      {step.notes.map((note, index) => (
        <Box key={`note-${step.n}-${index}`}>
          <Box flexShrink={0}>
            <Text color={DIM}>    · </Text>
          </Box>
          <Box flexGrow={1}>
            <Text color={DIM}>{note}</Text>
          </Box>
        </Box>
      ))}
    </React.Fragment>
  );
}

// This used to flush completed rows through Ink's <Static> (to avoid
// re-printing the whole tree — including HeaderBar and LearnPane — into
// the user's real terminal scrollback on every step). <Static> content is
// committed to the terminal immediately and can never be repositioned by a
// later re-render, which caused a recurring class of bugs once it had to
// coexist with anything else that's live and redraws on its own schedule:
// the "Tasks" heading drifting below newly-flushed rows, <Static> re-
// flushing everything from scratch on remount, and (confirmed in a real
// v0.4.1 run) the always-live HeaderBar visually detaching above the
// permanently-flushed rows because it keeps redrawing below each new flush.
//
// Now that the whole wizard renders into the alternate screen buffer (see
// bin/wizard.cjs's ENTER_ALT_SCREEN) — discarded wholesale on exit, never
// touching real scrollback — <Static>'s original justification no longer
// applies. Render the full list live every time instead, exactly the way
// PostHog's own wizard does (confirmed zero <Static> usage anywhere in
// their TUI). A brief full-tree redraw per step is imperceptible in this
// ~10-30 second flow and keeps HeaderBar/Tasks as one cohesive block.
export default function StepList({ steps, total }) {
  return (
    <Box flexDirection="column">
      <Text color={GREEN} bold>
        Tasks
      </Text>
      <Text />
      {steps.map((step) => (
        <StepRow key={step.n} step={step} total={total} />
      ))}
    </Box>
  );
}
