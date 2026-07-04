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
 * Hand the terminal to a raw-stdio operation (a `stdio: 'inherit'` child
 * process, `readline`, or `@clack/prompts`) without tearing down Ink's
 * render tree, and return the operation's result.
 *
 * Ink is kept mounted the *whole* wizard run — a single `render()` call in
 * main(), a single `unmount()` at the very end. Earlier this helper used to
 * fully `unmount()`/remount Ink around every raw-stdio window, but each
 * remount is a brand-new Ink instance with no memory of the terminal real
 * estate the previous instance already painted, so it repainted the entire
 * tree (banner included) again from scratch below the old frame — that's
 * the duplicate-banner bug seen in real runs. Neither Banner.js nor
 * StepList.js calls Ink's `useInput`, so Ink never actually engages stdin
 * raw mode in this app (confirmed against ink's App.js: raw mode is only
 * toggled by `useInput`/`useFocus` consumers) — there's no raw-mode
 * contention with readline/clack to unmount for in the first place.
 *
 * The one thing that IS still required here is `inkInstance.clear()`
 * (log-update's line-eraser) immediately before `fn()` runs. It resets
 * log-update's internal `previousLineCount` to 0. Without it, the *next*
 * repaint after this window (e.g. the following `okStep()`/`failStep()`
 * call) would erase N lines counting from wherever the cursor currently
 * sits — which by then is inside the subprocess's or clack's own output,
 * not Ink's last frame — silently eating the last few lines of whatever
 * they printed. Do not drop this call even though `.unmount()` is gone.
 *
 * The caller is expected to freeze any self-driven re-renders (e.g. the
 * StepList spinner's own `setInterval`) via a `suspended` prop before
 * calling this, and un-freeze after — see `suspend()` in bin/wizard.cjs.
 * The two `spawnSync(..., {stdio:'inherit'})` callers of this (`bacon-setup
 * init`, login) block Node's event loop entirely, so Ink structurally
 * cannot write during those windows regardless. The `@clack/prompts` and
 * "press ENTER" windows keep the event loop alive, so a terminal-resize
 * event during those could in principle trigger Ink's own resize-driven
 * repaint mid-window — accepted as a narrow, low-probability edge case
 * rather than engineered away, given this is a short one-shot CLI.
 *
 * @template T
 * @param {{ clear?: () => void }} inkInstance
 *   The object returned by ink's `render(...)`.
 * @param {() => (T | Promise<T>)} fn
 *   Callback performing the raw-terminal-owning operation.
 * @returns {Promise<T>}
 */
export async function withSuspendedRender(inkInstance, fn) {
  if (inkInstance && typeof inkInstance.clear === "function") {
    try {
      inkInstance.clear();
    } catch {
      // Best-effort — a failed clear must never block the operation.
    }
  }
  return await fn();
}
