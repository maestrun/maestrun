import type { TaskState } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { gitCommand, gitOutput, snapshotWorktree } from "./worktree-git.js";
import { preserveConflict } from "./worktree-conflict.js";
import { verifyWorktree } from "./task-worktree.js";

export async function integrateWorktree(context: RunContext, state: TaskState): Promise<void> {
  const prepared = await prepareWorktreeIntegration(context, state);
  await finishWorktreeIntegration(context, state, prepared);
}

export async function prepareWorktreeIntegration(
  context: RunContext,
  state: TaskState,
): Promise<{ path: string; patch: string }> {
  if (!state.worktree) throw new Error("Missing task worktree");
  state.step = "integration";
  state.integration = "running";
  await context.update(state);
  const path = await verifyWorktree(context.cwd, state.worktree);
  state.worktree.result = await snapshotWorktree(path, state.worktree.base);
  await context.update(state);
  if (context.signal.aborted) throw new CancelError();
  return { path, patch: await integrationPatch(context, state, path) };
}

export async function finishWorktreeIntegration(
  context: RunContext,
  state: TaskState,
  prepared: { path: string; patch: string },
): Promise<void> {
  if (!state.worktree) throw new Error("Missing task worktree");
  const { path, patch } = prepared;
  await applyTaskPatch(context, patch, path);
  state.worktree.integrated = true;
  state.status = "completed";
  delete state.error;
  await context.update(state);
  await removeIntegratedWorktree(context, path);
  for (const previous of state.worktree.retained ?? []) {
    try {
      await removeIntegratedWorktree(context, await verifyWorktree(context.cwd, previous));
    } catch {
      context.ui.log(
        `Earlier worktree ${previous.id} was preserved because its Git state changed.`,
      );
    }
  }
}

async function integrationPatch(
  context: RunContext,
  state: TaskState,
  path: string,
): Promise<string> {
  if (!state.worktree?.result) throw new Error("Missing integration result");
  const current = await snapshotWorktree(context.cwd, state.worktree.base);
  const merged = await gitCommand(context.cwd, [
    "merge-tree",
    "--write-tree",
    "-z",
    current,
    state.worktree.result,
  ]);
  if (merged.code === 1) await preserveConflict(context, state, { current, output: merged.stdout });
  if (merged.code !== 0)
    throw new UserError(
      "Git could not merge the task result.",
      `Inspect ${path}; task changes were preserved.`,
    );
  const tree = merged.stdout.split("\0")[0] ?? "";
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(tree)) throw new Error("Invalid Git merge tree");
  return integrationDiff(context.cwd, current, tree);
}

async function integrationDiff(cwd: string, current: string, tree: string): Promise<string> {
  const patch = await gitCommand(cwd, [
    "diff",
    "--binary",
    "--full-index",
    "--no-ext-diff",
    "--no-textconv",
    current,
    tree,
  ]);
  if (patch.code !== 0)
    throw new UserError(
      "Could not prepare integration patch.",
      "Inspect the retained task worktree and Git state, then retry.",
    );
  return patch.stdout;
}

async function applyTaskPatch(context: RunContext, patch: string, path: string): Promise<void> {
  if (context.signal.aborted) throw new CancelError();
  if (!patch.trim()) return;
  const check = await gitCommand(context.cwd, ["apply", "--check", "--binary", "-"], {
    input: patch,
  });
  if (check.code !== 0)
    throw new UserError(
      "The project changed before task integration.",
      `Review the changes in ${path} and the project, then retry. No integration patch was applied.`,
    );
  if (context.signal.aborted) throw new CancelError();
  // Finish the atomic patch application even if cancellation arrives, then persist its receipt.
  await gitOutput(context.cwd, ["apply", "--binary", "-"], { input: patch });
}

async function removeIntegratedWorktree(context: RunContext, path: string): Promise<void> {
  try {
    await gitOutput(context.cwd, ["worktree", "remove", "--force", path]);
  } catch {
    context.ui.log(
      `Task integrated; cleanup is pending for ${path}. Remove it with git worktree remove after reviewing retained files.`,
    );
  }
}
