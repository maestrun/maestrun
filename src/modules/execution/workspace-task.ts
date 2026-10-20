import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { TaskState, TaskWorktree } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import type { RepositoryBase } from "./workspace-repositories.js";
import { verifyRepositoryPath } from "./workspace-repositories.js";
import { gitOutput } from "./worktree-git.js";
import { requireResolvedWorktree, verifyWorktree, worktreePath } from "./task-worktree.js";
import { copyWorktreeSettings } from "./worktree-settings.js";
import { refreshRepairWorktree } from "./worktree-refresh.js";
import { copyWorkspaceContext, safeWorkspaceDirectory } from "./workspace-context.js";
import { UserError } from "../../shared/errors.js";

export type WorkspaceRepository = NonNullable<TaskWorktree["repositories"]>[number];

export function repositoryTask(
  context: RunContext,
  state: TaskState,
  entry: WorkspaceRepository,
): { context: RunContext; state: TaskState } {
  const child = { ...state, worktree: entry.worktree };
  return {
    state: child,
    context: {
      ...context,
      cwd: join(context.cwd, entry.path),
      update: async () => {
        entry.worktree = child.worktree;
        await context.update(state);
      },
    },
  };
}

export async function prepareWorkspace(
  context: RunContext,
  state: TaskState,
  bases: readonly RepositoryBase[],
): Promise<string> {
  if (!state.worktree || state.worktree.integrated) await allocateWorkspace(context, state, bases);
  const workspace = state.worktree;
  if (!workspace?.repositories) throw new Error("Missing workspace repositories");
  if (
    workspace.repositories.length !== bases.length ||
    workspace.repositories.some((entry) => !bases.some((base) => base.path === entry.path))
  )
    throw new UserError(
      "The workspace repositories changed since the saved run.",
      "Restore the original repository directories before resuming; preserve the saved worktrees.",
    );
  await refreshRepositories(context, state, bases);
  for (const entry of workspace.repositories) await mountRepository(context, state, entry);
  const path = worktreePath(context.cwd, workspace);
  if (!workspace.contextHash) {
    workspace.contextHash = await copyWorkspaceContext(
      context.cwd,
      path,
      workspace.repositories.map((entry) => entry.path),
    );
    await context.update(state);
  }
  await copyWorktreeSettings(context, path);
  return path;
}

async function allocateWorkspace(
  context: RunContext,
  state: TaskState,
  bases: readonly RepositoryBase[],
): Promise<void> {
  if (state.completedSteps > 0)
    throw new UserError(
      "Partial progress has no isolated workspace.",
      "Resume in sequential mode before enabling parallel execution.",
    );
  const id = randomUUID();
  state.worktree = {
    id,
    base: bases[0]?.base ?? "",
    repositories: bases.map(({ path, base }) => ({
      path,
      worktree: {
        id: randomUUID(),
        base,
        pending: true,
        workspace: { id, path },
      },
    })),
  };
  await context.update(state);
}

async function refreshRepositories(
  context: RunContext,
  state: TaskState,
  bases: readonly RepositoryBase[],
): Promise<void> {
  const workspace = state.worktree;
  if (!workspace?.repositories) throw new Error("Missing workspace");
  for (const entry of workspace.repositories) {
    await verifyRepositoryPath(context.cwd, entry.path);
    const base = bases.find((item) => item.path === entry.path)?.base;
    if (!base)
      throw new UserError(
        "A workspace repository is missing.",
        `Restore ${entry.path} before resuming.`,
      );
    if (entry.worktree.pending || entry.worktree.integrated) continue;
    const child = repositoryTask(context, state, entry);
    await refreshRepairWorktree(child.context, child.state, base);
  }
  if (
    workspace.repositories.some(
      (entry) => !entry.worktree.integrated && entry.worktree.workspace?.id !== workspace.id,
    )
  ) {
    workspace.id = randomUUID();
    delete workspace.contextHash;
    await context.update(state);
  }
}

async function mountRepository(
  context: RunContext,
  state: TaskState,
  entry: WorkspaceRepository,
): Promise<void> {
  if (entry.worktree.integrated) return;
  const cwd = join(context.cwd, entry.path);
  const workspace = { id: state.worktree?.id ?? "", path: entry.path };
  const destination = worktreePath(cwd, { ...entry.worktree, workspace });
  await safeWorkspaceDirectory(dirname(destination));
  if (entry.worktree.pending) {
    await gitOutput(cwd, ["worktree", "add", "--detach", destination, entry.worktree.base], {
      signal: context.signal,
    });
    delete entry.worktree.pending;
  } else {
    const original = await verifyWorktree(cwd, entry.worktree);
    if (original !== destination) await gitOutput(cwd, ["worktree", "move", original, destination]);
  }
  entry.worktree.workspace = workspace;
  await context.update(state);
  if (entry.worktree.resolving) await requireResolvedWorktree(destination);
}
