// src/ui/useWizardSteps.js
//
// Plain state/orchestration helpers for the wizard's step list. No React
// components are exported from this file — only a factory, a hook, and an
// Ink-render-suspension helper. The `StepState` shape produced here is the
// single shared contract with StepList.js:
//
//   {
//     n: number,                                    // 1-based step index
//     label: string,
//     status: "pending" | "running" | "ok" | "fail",
//     activeLabel: string | undefined,
//     message: string | undefined,
//     notes: string[],
//   }

import { useCallback, useState } from "react";

/**
 * Build the initial StepState[] for a given ordered list of step labels.
 * @param {string[]} labels
 * @returns {Array<{n:number,label:string,status:string,activeLabel:(string|undefined),message:(string|undefined),notes:string[]}>}
 */
export function createInitialSteps(labels) {
  return labels.map((label, i) => ({
    n: i + 1,
    label,
    status: "pending",
    activeLabel: undefined,
    message: undefined,
    notes: [],
  }));
}

// Factory alias — callers may use either `createInitialSteps(labels)` or
// `initialSteps(labels)` to seed a StepState[] array.
export const initialSteps = createInitialSteps;

/**
 * React hook managing the wizard's step list state.
 * @param {string[]} labels
 */
export function useWizardSteps(labels) {
  const [steps, setSteps] = useState(() => createInitialSteps(labels));

  const updateStep = useCallback((n, patch) => {
    setSteps((prev) =>
      prev.map((step) => (step.n === n ? { ...step, ...patch } : step))
    );
  }, []);

  const startStep = useCallback(
    (n, activeLabel) => {
      updateStep(n, {
        status: "running",
        ...(activeLabel !== undefined ? { activeLabel } : {}),
      });
    },
    [updateStep]
  );

  const okStep = useCallback(
    (n, message) => {
      updateStep(n, { status: "ok", message });
    },
    [updateStep]
  );

  const failStep = useCallback(
    (n, message) => {
      updateStep(n, { status: "fail", message });
    },
    [updateStep]
  );

  const addNote = useCallback((n, note) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.n === n ? { ...step, notes: [...step.notes, note] } : step
      )
    );
  }, []);

  return { steps, startStep, okStep, failStep, addNote };
}

/**
 * Cleanly tear down an Ink render tree, hand the terminal back to a raw
 * `stdio: 'inherit'` child process, run `fn`, and return its result. The
 * caller is responsible for mounting a fresh Ink tree afterward — this
 * helper does not re-render/resume Ink itself.
 *
 * This exists because wizard.js's `runSetupInit()` and `runLogin()` run
 * `spawnSync("python3", [...], { stdio: "inherit" })` — a live Clerk-login
 * browser flow / live python3 output that needs direct, unshared control of
 * the terminal (including stdin). If Ink is still mounted (which puts stdin
 * into resumed/raw mode to read keypresses) when that subprocess starts,
 * the child can't reliably read/write the terminal — this shows up as a
 * broken login flow, swallowed keystrokes, or terminal corruption after the
 * child exits.
 *
 * @template T
 * @param {{ unmount: () => void, clear?: () => void, rerender?: Function }} inkInstance
 *   The object returned by ink's `render(...)`.
 * @param {() => (T | Promise<T>)} fn
 *   Callback performing the raw-terminal-owning operation (e.g. the
 *   spawnSync(..., { stdio: 'inherit' }) call).
 * @returns {Promise<T>}
 */
export async function withSuspendedRender(inkInstance, fn) {
  // Clear whatever Ink last painted, then unmount so Ink releases the
  // terminal (stops re-rendering, detaches its stdin listeners) before the
  // child process takes over stdio directly.
  if (inkInstance && typeof inkInstance.clear === "function") {
    try {
      inkInstance.clear();
    } catch {
      // Best-effort — a failed clear must never block teardown.
    }
  }
  if (inkInstance && typeof inkInstance.unmount === "function") {
    inkInstance.unmount();
  }

  // Ink resumes stdin and (on a TTY) sets raw mode while it owns the
  // terminal, so keypresses are delivered to it a byte at a time. A
  // spawnSync child with stdio: 'inherit' needs stdin left in a normal,
  // paused-from-our-side state — otherwise the child can fail to read
  // input at all, or input can be split between us and the child.
  const stdin = process.stdin;
  if (stdin && stdin.isTTY && typeof stdin.setRawMode === "function" && stdin.isRaw) {
    stdin.setRawMode(false);
  }
  if (stdin && typeof stdin.pause === "function") {
    stdin.pause();
  }

  // Run the caller's raw-terminal operation and propagate its result (or
  // its error) unchanged. We intentionally do not resume/re-render Ink
  // here: the caller decides when/whether to mount a fresh Ink tree once
  // this resolves.
  return await fn();
}
