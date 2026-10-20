import { randomUUID } from "node:crypto";
import type { TaskState, TaskWorktree } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { UserError } from "../../shared/errors.js";
import { gitCommand, gitOutput, snapshotWorktree } from "./worktree-git.js";
import { preserveConflict, retainedWorktrees } from "./worktree-conflict.js";
import { verifyWorktree, worktreePath } from "./task-worktree.js";

export async function refreshRepairWorktree(
  context: RunContext,
  state: TaskState,
  base: string,
): Promise<void> {
  const previous = state.worktree;
  if (
    !previous ||
    previous.integrated ||
    previous.resolving ||
    previous.base === base ||
    !context.report.orchestration?.tasks.some((task) => task.repairFor === state.id)
  )
    return;
  const original = await verifyWorktree(context.cwd, previous);
  const result = await snapshotWorktree(original, previous.base);
  const current = await snapshotWorktree(context.cwd, previous.base);
  const merged = await gitCommand(context.cwd, [
    "merge-tree",
    "--write-tree",
    "-z",
    current,
    result,
  ]);
  if (merged.code === 1) await preserveConflict(context, state, { current, output: merged.stdout });
  await installRefreshedWorktree(context, state, { current, tree: mergedTree(merged) });
}

function mergedTree(merged: { code: number | null; stdout: string }): string {
  const tree = merged.stdout.split("\0")[0] ?? "";
  if (merged.code !== 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(tree))
    throw new UserError(
      "Could not refresh the review worktree after repairs.",
      "Inspect the retained worktree; its original changes were preserved.",
    );
  return tree;
}

async function installRefreshedWorktree(
  context: RunContext,
  state: TaskState,
  merge: { current: string; tree: string },
): Promise<void> {
  const previous = state.worktree;
  if (!previous) throw new Error("Missing review worktree");
  const { current, tree } = merge;
  const recovery: TaskWorktree = {
    id: randomUUID(),
    base: current,
    retained: retainedWorktrees(previous),
  };
  const path = worktreePath(context.cwd, recovery);
  await gitOutput(context.cwd, ["worktree", "add", "--detach", path, current]);
  await gitOutput(path, ["read-tree", "--reset", "-u", tree]);
  state.worktree = recovery;
  await context.update(state);
}
