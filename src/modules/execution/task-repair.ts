import type { TaskState } from "../../contracts/run.js";
import type { Stage } from "../../contracts/workflow.js";
import { RefactorError, StepFailedError } from "../../shared/errors.js";
import type { RunContext } from "./execution.types.js";
import type { Task } from "../../contracts/tasks.js";
import { taskStages } from "./tasks.js";

export function coordinatorRepair(context: RunContext, task: Task, error: unknown): boolean {
  if (!(error instanceof RefactorError) || context.config.execution?.orchestrator !== "agent")
    return false;
  const stages = taskStages(context.config, task);
  const failed = context.report.tasks.find((state) => state.id === task.id)?.step;
  return !stages
    .slice(0, stages.findIndex((stage) => stage.id === failed) + 1)
    .some((stage) => stage.id === "implementation");
}

export function prepareRepair(
  state: TaskState,
  stages: readonly Stage[],
  repair: { error: unknown; attempt: number; limit: number },
): void {
  const { error, attempt, limit } = repair;
  if (!(error instanceof StepFailedError || error instanceof RefactorError)) throw error;
  const failed = stages.findIndex((stage) => stage.id === state.step);
  if (failed < 0) throw error;
  const implementation = stages.findIndex((stage) => stage.id === "implementation");
  const restart = implementation >= 0 && implementation <= failed ? implementation : failed;
  state.error = `Automatic repair (${attempt}/${limit}) after ${state.step}: ${error.message}`;
  state.completedSteps = restart;
  for (const [index, step] of (state.steps ?? []).entries()) {
    if (index >= restart) {
      step.status = index === failed && restart < failed ? "refactor" : "pending";
      delete step.summary;
    }
  }
}
