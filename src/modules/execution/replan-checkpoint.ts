import type { TaskState } from "../../contracts/run.js";
import { invalidCheckpoint } from "./checkpoint-error.js";

export function reconcileStages(current: TaskState, previous: TaskState): TaskState {
  const stages = current.steps ?? [];
  if (!stages.length) invalidCheckpoint("no execution stages are configured");
  const completed =
    previous.completedSteps === previous.totalSteps &&
    (!previous.worktree || previous.worktree.integrated);
  if (completed) return { ...previous, plannedStages: stages.map((step) => step.id) };
  if (
    previous.completedSteps > stages.length ||
    (previous.completedSteps > 0 && !previous.steps) ||
    previous.steps?.slice(0, previous.completedSteps).some((step, i) => step.id !== stages[i]?.id)
  )
    invalidCheckpoint(`completed stage order changed for unfinished task ${current.id}`);
  const reconciled = {
    ...previous,
    totalSteps: stages.length,
    steps: stages.map((step, i) =>
      i < previous.completedSteps
        ? (previous.steps?.[i] ?? step)
        : { ...previous.steps?.find((saved) => saved.id === step.id), ...step },
    ),
  };
  delete reconciled.plannedStages;
  return reconciled;
}
