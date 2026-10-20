import { join } from "node:path";
import { checkWorkspaceRepositories } from "./workspace-repositories.js";
import type { RepositoryBase } from "./workspace-repositories.js";
import { prepareWorkspace } from "./workspace-task.js";
import { integrateWorkspace } from "./workspace-integration.js";
import type { Task } from "../../contracts/tasks.js";
import type { TaskState } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { CancelError, isCancellation, UserError } from "../../shared/errors.js";
import { snapshotWorktree } from "./worktree-git.js";
import { prepareWorktree, worktreePath } from "./task-worktree.js";
import { integrateWorktree } from "./worktree-integration.js";
import { runTask } from "./task-runner.js";
import { refreshRepairWorktree } from "./worktree-refresh.js";

async function isolatedTask(
  context: RunContext,
  task: Task,
  bases: readonly RepositoryBase[],
): Promise<void> {
  const state = context.report.tasks.find((entry) => entry.id === task.id);
  if (!state) throw new Error("Missing task state");
  try {
    if (context.signal.aborted) throw new CancelError();
    const base = bases[0]?.base ?? "";
    const multiple = bases[0]?.path !== "." || Boolean(state.worktree?.repositories);
    if (!multiple) await refreshRepairWorktree(context, state, base);
    const path = multiple
      ? await prepareWorkspace(context, state, bases)
      : await prepareWorktree(context, state, base);
    await runTask(
      {
        ...context,
        cwd: path,
        projectCwd: context.cwd,
        ...(state.worktree?.repositories
          ? { repositoryPaths: state.worktree.repositories.map((entry) => entry.path) }
          : {}),
      },
      task,
    );
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
  const repositories = await checkWorkspaceRepositories(context.cwd);
  const bases: RepositoryBase[] = [];
  for (const entry of repositories)
    bases.push({
      path: entry.path,
      base: await snapshotWorktree(join(context.cwd, entry.path), entry.base),
    });
  const outcomes = await Promise.allSettled(
    tasks.map((task) => isolatedTask(context, task, bases)),
  );
  const failure = outcomes.find((outcome) => outcome.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  for (const task of tasks) {
    const state = context.report.tasks.find((entry) => entry.id === task.id);
    if (!state) throw new Error("Missing task state");
    await integrateTask(context, state);
    if (state.worktree && !state.worktree.integrated && state.status !== "on_hold") {
      const retained = `Worktree preserved: ${worktreePath(context.cwd, state.worktree)}`;
      state.error = `${state.error ?? "Task did not integrate."} ${retained}`;
      context.ui.log(retained);
      await context.update(state);
    }
  }
}

async function integrateTask(context: RunContext, state: TaskState): Promise<void> {
  if (state.status === "running" && state.completedSteps === state.totalSteps) {
    try {
      if (state.worktree?.repositories) await integrateWorkspace(context, state);
      else await integrateWorktree(context, state);
    } catch (error) {
      await workspaceFailure(context, state, error);
    }
  }
}
