import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import figures from 'figures';
import { GREEN, DIM, BRIGHT, FAIL } from './theme.js';

// One line per step: "[n/total]" prefix + status icon/spinner + label or
// message, all on a single row (fixed-width flexShrink: 0 prefix next to a
// flexGrow: 1 text that can wrap on its own). This used to be two lines per
// step (a "[n/total] label" header row, then a separate status row below),
// which — combined with every step rendering live simultaneously once
// <Static> was removed (see the default export's doc comment) — pushed
// StepList's total height to ~19-20 lines. That's enough to reach or
// exceed a real terminal's row count, which trips Ink's own fallback in
// onRender() (ink/build/ink.js): `if (outputHeight >= stdout.rows)` does a
// full-screen clear + full redraw on EVERY render instead of its normal
// targeted line-erase. Confirmed via a real PTY capture (raw bytes fed
// through pyte, a proper terminal emulator) that this fired ~16 times in
// under 2 seconds while a spinner was animating — clearing the whole
// screen at ~12Hz causes visible tearing on a real terminal that reads as
// stacked duplicate frames. Halving the height (one line per step instead
// of two) keeps the total render comfortably under any real terminal size.
function PendingRow({ step, total }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={DIM}>{`[${step.n}/${total}] · `}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={DIM}>{step.label}</Text>
      </Box>
    </Box>
  );
}

function RunningRow({ step, total }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={DIM}>{`[${step.n}/${total}] `}</Text>
        <InkSpinner />
        <Text> </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={BRIGHT}>{step.activeLabel ?? step.label}</Text>
      </Box>
    </Box>
  );
}

function OkRow({ step, total }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={DIM}>{`[${step.n}/${total}] `}</Text>
        <Text color={GREEN}>{figures.tick} </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{step.message}</Text>
      </Box>
    </Box>
  );
}

function FailRow({ step, total }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={DIM}>{`[${step.n}/${total}] `}</Text>
        <Text color={FAIL}>{figures.cross} </Text>
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
      {StatusRow ? <StatusRow step={step} total={total} /> : null}
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
