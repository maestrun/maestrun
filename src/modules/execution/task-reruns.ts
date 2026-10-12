import type { TaskState } from "../../contracts/run.js";
import { isRecord } from "../../contracts/workflow.js";
import type { Stage } from "../../contracts/workflow.js";

export function recordImplementationRerun(state: TaskState, stage: Stage): void {
  if (stage.id !== "implementation" || !state.step || (!state.error && state.step !== stage.id))
    return;
  (state.reruns ??= []).push({
    startedAt: new Date().toISOString(),
    fromStep: state.step,
    toStep: "implementation",
    justification: state.error ?? "Previous Implementation attempt did not complete.",
  });
}

export function validReruns(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.startedAt === "string" &&
        Number.isFinite(Date.parse(entry.startedAt)) &&
        typeof entry.fromStep === "string" &&
        !!entry.fromStep.trim() &&
        entry.toStep === "implementation" &&
        typeof entry.justification === "string" &&
        !!entry.justification.trim(),
    )
  );
}
