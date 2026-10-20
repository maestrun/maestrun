import type { TaskState } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { UserError } from "../../shared/errors.js";
import { worktreePath } from "./task-worktree.js";
import { repositoryTask } from "./workspace-task.js";
import { prepareWorktreeIntegration, finishWorktreeIntegration } from "./worktree-integration.js";
import { workspaceContextHash } from "./workspace-context.js";

export async function integrateWorkspace(context: RunContext, state: TaskState): Promise<void> {
  const workspace = state.worktree;
  if (!workspace?.repositories) throw new Error("Missing workspace");
  await verifyWorkspaceContext(context, state);
  state.step = "integration";
  state.integration = "running";
  await context.update(state);
  const patches = [];
  for (const entry of workspace.repositories.filter((entry) => !entry.worktree.integrated)) {
    const child = repositoryTask(context, state, entry);
    patches.push({
      ...child,
      prepared: await prepareWorktreeIntegration(child.context, child.state),
    });
  }
  for (const child of patches)
    await finishWorktreeIntegration(child.context, child.state, child.prepared);
  workspace.integrated = true;
  state.status = "completed";
  delete state.error;
  await context.update(state);
}

async function verifyWorkspaceContext(context: RunContext, state: TaskState): Promise<void> {
  const workspace = state.worktree;
  if (!workspace?.repositories) throw new Error("Missing workspace");
  const root = worktreePath(context.cwd, workspace);
  if (
    (await workspaceContextHash(
      root,
      workspace.repositories.map((entry) => entry.path),
    )) !== workspace.contextHash
  )
    throw new UserError(
      "The task changed files outside the Git repositories.",
      `Preserve those changes from ${root} manually. Only repository files can be integrated automatically.`,
    );
}
