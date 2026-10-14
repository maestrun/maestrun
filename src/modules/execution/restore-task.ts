import type { TaskState } from "../../contracts/run.js";
import { invalidCheckpoint } from "./checkpoint-error.js";
import { reconcileStages } from "./replan-checkpoint.js";
import { pendingInput } from "./task-input.js";

function checkMatch(current: TaskState, previous: TaskState): void {
  if (
    previous.definition
      ? previous.definition !== current.definition
      : previous.title !== current.title
  )
    invalidCheckpoint(`task ${current.id} changed since the saved run`);
  if (
    previous.plannedStages
      ? JSON.stringify(previous.plannedStages) !==
        JSON.stringify(current.steps?.map((step) => step.id))
      : previous.totalSteps !== current.totalSteps ||
        previous.steps?.some((step, i) => step.id !== current.steps?.[i]?.id)
  )
    invalidCheckpoint(`workflow stages changed for task ${current.id}`);
}
export function restoreTask(
  current: TaskState & { definition: string },
  saved: TaskState | undefined,
  replan = false,
): TaskState {
  const previous = saved && replan ? reconcileStages(current, saved) : saved;
  if (!previous) return current;
  checkMatch(current, previous);
  const pendingIntegration = previous.worktree && !previous.worktree.integrated;
  const completed = previous.completedSteps === previous.totalSteps && !pendingIntegration;
  if (completed && previous.plannedStages)
    return cleanRestored(
      { ...previous, definition: current.definition, status: "completed" },
      previous,
    );
  const restored = {
    ...previous,
    ...current,
    completedSteps: previous.completedSteps,
    status: completed ? ("completed" as const) : ("pending" as const),
    steps: (current.steps ?? []).map((step, i) =>
      i < previous.completedSteps
        ? { ...(previous.steps?.[i] ?? step), status: "completed" as const }
        : { ...previous.steps?.[i], ...step },
    ),
  };
  if (!current.integration && !previous.worktree) delete restored.integration;
  return cleanRestored(restored, previous);
}

function cleanRestored(restored: TaskState, previous: TaskState): TaskState {
  delete restored.repairAttempts;
  const request = pendingInput(restored);
  if (request && restored.status !== "completed") {
    if (restored.steps?.[restored.completedSteps]?.id !== request.stage)
      invalidCheckpoint(`stage awaiting input changed for task ${restored.id}`);
    restored.status = "on_hold";
    const step = restored.steps?.find((entry) => entry.id === request.stage);
    if (step) step.status = "on_hold";
  }
  if (!restored.worktree && restored.status === "completed") delete restored.integration;
  if (!previous.tokenUsage && previous.completedSteps > 0) restored.tokenUsageIncomplete = true;
  if (restored.status === "completed" || typeof restored.error !== "string") delete restored.error;
  if (restored.status !== "completed") {
    delete restored.conversationId;
    delete restored.conversation;
  }
  return restored;
}
