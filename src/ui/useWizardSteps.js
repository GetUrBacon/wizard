// src/ui/useWizardSteps.js
//
// Plain state/orchestration helpers for the wizard's step list. No React
// components are exported from this file — only a factory and a hook. The
// `StepState` shape produced here is the single shared contract with
// StepList.js:
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
