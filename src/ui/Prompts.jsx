import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmInput, Select, MultiSelect } from '@inkjs/ui';
import { PRIMARY } from './theme.js';

// None of @inkjs/ui's input components have built-in cancel handling (no
// onCancel/escape support — verified against their source), so each of these
// wraps its component in a top-level useInput listening for Escape or
// Ctrl+C to call `onCancel`. This replaces @clack/prompts' isCancel()/
// Ctrl+C handling from the old suspended-terminal flow, without ever
// needing to suspend Ink or hand off raw stdio for it.
function useCancelKey(onCancel) {
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) onCancel();
  });
}

export function AskConfirm({ message, onSubmit, onCancel }) {
  useCancelKey(onCancel);
  return (
    <Box flexDirection="column">
      <Text color={PRIMARY}>{message}</Text>
      <Box marginTop={1}>
        <ConfirmInput onConfirm={() => onSubmit(true)} onCancel={onCancel} />
      </Box>
    </Box>
  );
}

// No `defaultValue`/initial-value prop here, deliberately: @inkjs/ui's
// Select always visually focuses `options[0]` on mount regardless of any
// `defaultValue` you pass it — that prop only sets a baseline for its
// internal change-detection, it never moves the cursor. Worse, if
// `defaultValue` isn't options[0], the reducer's `value`/`previousValue`
// both start equal to it, so pressing Enter without moving the cursor
// away from options[0] doesn't register as a "change" and onChange never
// fires at all (verified directly against use-select-state.js's reducer).
// The fix is structural: callers put their intended default option first
// in the `options` array, and Select's onChange then reliably fires the
// moment Enter is pressed, even without ever moving the cursor.
export function AskSelect({ message, options, onSubmit, onCancel }) {
  useCancelKey(onCancel);
  return (
    <Box flexDirection="column">
      <Text color={PRIMARY} bold>{message}</Text>
      <Box marginTop={1}>
        <Select options={options} onChange={onSubmit} />
      </Box>
    </Box>
  );
}

export function AskMultiSelect({ message, options, initialValues, onSubmit, onCancel }) {
  useCancelKey(onCancel);
  return (
    <Box flexDirection="column">
      <Text color={PRIMARY} bold>{message}</Text>
      <Box marginTop={1}>
        {/* Unlike Select above, MultiSelect's `defaultValue` (pre-checked options
            by value) is NOT subject to the same bug: a multi-select's set of
            checked values is independent of which option currently has cursor
            focus, whereas Select's single `value` is tied to whatever option is
            focused when Enter is pressed. */}
        <MultiSelect options={options} defaultValue={initialValues} onSubmit={onSubmit} />
      </Box>
    </Box>
  );
}
