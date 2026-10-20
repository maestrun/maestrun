import {
  CancelError,
  UserError,
  RefactorError,
  StepFailedError,
  StepInputRequired,
  AuthenticationRequiredError,
  isCancellation,
} from "../../shared/errors.js";
import { DEFAULT_MAX_REPAIRS } from "../../contracts/workflow.js";
import { previousStageResults } from "./step-evidence.js";
import { coordinatorRepair, prepareRepair } from "./task-repair.js";
import type { RunContext } from "./execution.types.js";
import type { TaskState } from "../../contracts/run.js";
import type { Task } from "../../contracts/tasks.js";
import { taskStages } from "./tasks.js";
import { startStep, setStepStatus } from "./task-step-state.js";
import { validTokenUsage } from "../../shared/token-usage.js";
import { holdTask } from "./task-input.js";
function errorMessage(error: unknown): string {
  return error instanceof UserError
    ? `${error.message} Next: ${error.nextAction}`
    : "Step failed. Check executor installation, task instructions and file permissions.";
}
export async function runTask(context: RunContext, task: Task): Promise<void> {
  const state = context.report.tasks.find((entry) => entry.id === task.id);
  if (!state) throw new Error("Missing task state");
  try {
    await runWithRepairs(context, task, state);
    state.status = context.projectCwd ? "running" : "completed";
    if (context.projectCwd) {
      state.step = "integration";
      state.integration = "pending";
    }
    delete state.error;
  } catch (error) {
    failTask(state, context.signal, error);
  }
  await context.update(state);
}
async function runWithRepairs(context: RunContext, task: Task, state: TaskState): Promise<void> {
  const limit = context.config.execution?.maxRepairs ?? DEFAULT_MAX_REPAIRS;
  for (let attempt = state.repairAttempts ?? 0; ; attempt++) {
    try {
      await runStages(context, task, state);
      return;
    } catch (error) {
      checkCancellation(context.signal);
      if (attempt >= limit || coordinatorRepair(context, task, error)) throw error;
      prepareRepair(state, taskStages(context.config, task), {
        error,
        attempt: attempt + 1,
        limit,
      });
      state.repairAttempts = attempt + 1;
    }
  }
}

async function runStages(context: RunContext, task: Task, state: TaskState): Promise<void> {
  for (const stage of taskStages(context.config, task)) {
    if (state.steps?.some((step) => step.id === stage.id && step.status === "completed")) continue;
    checkCancellation(context.signal);
    startStep(state, stage, context);
    await context.update(state);
    state.summary = await executeStage(context, state, {
      cwd: context.cwd,
      ...(context.projectCwd ? { projectCwd: context.projectCwd } : {}),
      ...(context.repositoryPaths ? { repositoryPaths: context.repositoryPaths } : {}),
      maxRepairs: context.config.execution?.maxRepairs ?? DEFAULT_MAX_REPAIRS,
      task,
      stage,
      previousResults: previousStageResults(state),
      signal: context.signal,
      timeoutMs: context.config.timeoutMs ?? 600000,
      ...(state.conversationId ? { conversationId: state.conversationId } : {}),
      ...(state.error ? { feedback: state.error } : {}),
      ...(state.inputRequests ? { inputRequests: state.inputRequests } : {}),
    });
    checkCancellation(context.signal);
    state.completedSteps += 1;
    setStepStatus(state, "completed");
    await context.update(state);
  }
}

async function executeStage(
  context: RunContext,
  state: TaskState,
  input: Parameters<RunContext["execute"]>[0],
): Promise<string> {
  let reported = false;
  const records = [state, ...(state.steps?.filter((step) => step.id === input.stage.id) ?? [])];
  try {
    return await context.execute({
      ...input,
      onUsage: (usage) => {
        if (!validTokenUsage(usage)) return;
        reported = true;
        for (const record of records) {
          record.tokenUsage ??= { inputTokens: 0, outputTokens: 0 };
          record.tokenUsage.inputTokens += usage.inputTokens;
          record.tokenUsage.outputTokens += usage.outputTokens;
        }
      },
    });
  } catch (error) {
    if (!isModelResult(error)) for (const record of records) record.tokenUsageIncomplete = true;
    throw error;
  } finally {
    if (!reported) for (const record of records) record.tokenUsageIncomplete = true;
  }
}

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelError();
}

function failTask(state: TaskState, signal: AbortSignal, error: unknown): void {
  if (!signal.aborted && error instanceof AuthenticationRequiredError)
    return holdTask(
      state,
      new StepInputRequired(
        `${error.nextAction} Confirm here when login is complete to resume this step.`,
        error.message,
      ),
    );
  if (!signal.aborted && error instanceof StepInputRequired) return holdTask(state, error);
  state.status = signal.aborted || isCancellation(error) ? "cancelled" : "failed";
  if (state.status !== "cancelled" && error instanceof RefactorError) state.status = "refactor";
  setStepStatus(state, state.status);
  state.error = state.status === "cancelled" ? "Cancelled." : errorMessage(error);
}

function isModelResult(error: unknown): boolean {
  return (
    error instanceof StepFailedError ||
    error instanceof RefactorError ||
    error instanceof StepInputRequired
  );
}
