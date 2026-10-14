import type { Task } from "../../contracts/tasks.js";
import type { TaskState } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { CancelError, isCancellation, UserError } from "../../shared/errors.js";
import { checkWorktreeRepository, snapshotWorktree } from "./worktree-git.js";
import { prepareWorktree, worktreePath } from "./task-worktree.js";
import { integrateWorktree } from "./worktree-integration.js";
import { runTask } from "./task-runner.js";

async function isolatedTask(context: RunContext, task: Task, base: string): Promise<void> {
  const state = context.report.tasks.find((entry) => entry.id === task.id);
  if (!state) throw new Error("Missing task state");
  try {
    if (context.signal.aborted) throw new CancelError();
    const path = await prepareWorktree(context, state, base);
    await runTask({ ...context, cwd: path, projectCwd: context.cwd }, task);
  } catch (error) {
    await workspaceFailure(context, state, error);
  }
}

async function workspaceFailure(
  context: RunContext,
  state: TaskState,
  error: unknown,
): Promise<void> {
  state.status = isCancellation(error) || context.signal.aborted ? "cancelled" : "failed";
  state.error =
    error instanceof UserError
      ? `${error.message} Next: ${error.nextAction}`
      : "Could not prepare or integrate the task worktree. Inspect its saved files and Git state before retrying.";
  await context.update(state);
}

export async function runIsolatedTasks(context: RunContext, tasks: readonly Task[]): Promise<void> {
  const head = await checkWorktreeRepository(context.cwd);
  const base = await snapshotWorktree(context.cwd, head);
  const outcomes = await Promise.allSettled(tasks.map((task) => isolatedTask(context, task, base)));
  const failure = outcomes.find((outcome) => outcome.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  for (const task of tasks) {
    const state = context.report.tasks.find((entry) => entry.id === task.id);
    if (!state) throw new Error("Missing task state");
    if (state.status === "running" && state.completedSteps === state.totalSteps) {
      try {
        await integrateWorktree(context, state);
      } catch (error) {
        await workspaceFailure(context, state, error);
      }
    }
    if (state.worktree && !state.worktree.integrated && state.status !== "on_hold") {
      const retained = `Worktree preserved: ${worktreePath(context.cwd, state.worktree)}`;
      state.error = `${state.error ?? "Task did not integrate."} ${retained}`;
      context.ui.log(retained);
      await context.update(state);
    }
  }
}
