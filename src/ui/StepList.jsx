import React from 'react';
import { Box, Text, Static } from 'ink';
import { GREEN, DIM, BRIGHT, FAIL } from './theme.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// While `suspended` (a raw-stdio window is open — see withSuspendedRender in
// useWizardSteps.js), the interval is skipped entirely so this component
// never triggers a state change, and therefore never triggers an Ink
// repaint, while a subprocess/readline/clack owns the terminal.
function Spinner({ suspended }) {
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    if (suspended) return undefined;
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [suspended]);

  return <Text color={BRIGHT}>{SPINNER_FRAMES[frameIndex]}</Text>;
}

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

function RunningRow({ step, suspended }) {
  return (
    <Box>
      <Box flexShrink={0}>
        <Text>  </Text>
        <Spinner suspended={suspended} />
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
        <Text color={GREEN}>  ✓ </Text>
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
        <Text color={FAIL}>  ✗ </Text>
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

function StepRow({ step, total, suspended }) {
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
      {StatusRow ? <StatusRow step={step} suspended={suspended} /> : null}
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

const HEADING = { __heading: true };

// Ink's <Static> writes its flushed items directly to permanent terminal
// scrollback and removes them from the live-redraw region. If the "Tasks"
// heading were rendered as a plain sibling before a separate <Static> block,
// it would look fine initially but then visually drift downward every time
// a step finishes, because the heading is part of the live region that gets
// erased-and-redrawn below whatever <Static> just flushed. The fix: put the
// heading INSIDE the same Static items array, as a leading sentinel object,
// so it is flushed exactly once, permanently, before any step rows, and is
// never part of the live-redraw region.
//
// This relies on `finished` only ever growing — steps move
// pending -> running -> ok-or-fail and never revert, which is already true
// of this codebase's step state machine.
export default function StepList({ steps, total, suspended = false, showHeading = true }) {
  const finished = steps.filter((s) => s.status === 'ok' || s.status === 'fail');
  const live = steps.filter((s) => s.status === 'pending' || s.status === 'running');
  const staticItems = showHeading ? [HEADING, ...finished] : finished;

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>
        {(item) =>
          item.__heading ? (
            <React.Fragment key="heading">
              <Text color={GREEN} bold>
                Tasks
              </Text>
              <Text />
            </React.Fragment>
          ) : (
            <StepRow key={item.n} step={item} total={total} suspended={suspended} />
          )
        }
      </Static>
      {live.map((step) => (
        <StepRow key={step.n} step={step} total={total} suspended={suspended} />
      ))}
    </Box>
  );
}
