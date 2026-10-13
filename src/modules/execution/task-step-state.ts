import { randomUUID } from "node:crypto";
import type { TaskState } from "../../contracts/run.js";
import type { Stage } from "../../contracts/workflow.js";
import type { RunContext } from "./execution.types.js";
import { recordImplementationRerun } from "./task-reruns.js";

export function startStep(state: TaskState, stage: Stage, context: RunContext): void {
  recordImplementationRerun(state, stage);
  const provider = context.providers?.[stage.id];
  Object.assign(state, {
    status: "running",
    step: stage.id,
    executor: provider ? `plugin:${provider}` : stage.executor,
    model: provider ? "n/a" : stage.model,
  });
  delete state.summary;
  if (stage.effort && !provider) state.effort = stage.effort;
  else delete state.effort;
  setStepStatus(state, "running");
  if (!provider) state.conversationId = randomUUID();
  else delete state.conversationId;
  delete state.conversation;
  const step = state.steps?.find((entry) => entry.id === stage.id);
  if (step) {
    delete step.conversation;
    if (state.conversationId) step.conversationId = state.conversationId;
    else delete step.conversationId;
  }
}

export function setStepStatus(
  state: TaskState,
  status: "running" | "completed" | "failed" | "refactor" | "cancelled",
): void {
  const step = state.steps?.find((entry) => entry.id === state.step);
  if (step) {
    step.status = status;
    if (status === "completed" && state.summary !== undefined) step.summary = state.summary;
    else delete step.summary;
  }
}
