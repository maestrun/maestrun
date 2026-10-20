import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TaskState, TaskWorktree } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { UserError } from "../../shared/errors.js";
import { ensureHomeDirectory, maestrunHome } from "../../shared/home.js";
import { commonGitDirectory, gitCommand, gitOutput } from "./worktree-git.js";
import { validWorktree } from "./worktree-validation.js";
export { validWorktree } from "./worktree-validation.js";
import { copyWorktreeSettings } from "./worktree-settings.js";

export function worktreePath(cwd: string, worktree: TaskWorktree): string {
  if (!validWorktree(worktree))
    throw new UserError(
      "Invalid saved task worktree.",
      "Restore the original .maestrun/run.json before retrying.",
    );
  if (worktree.workspace) {
    const root = resolve(cwd, ...worktree.workspace.path.split("/").map(() => ".."));
    return join(
      maestrunHome(),
      "worktrees",
      projectId(root),
      worktree.workspace.id,
      worktree.workspace.path,
    );
  }
  return join(maestrunHome(), "worktrees", projectId(cwd), worktree.id);
}

function projectId(cwd: string): string {
  return createHash("sha256").update(resolve(cwd)).digest("hex");
}

async function worktreeParent(cwd: string): Promise<void> {
  await ensureHomeDirectory("worktrees", projectId(cwd));
}

export async function verifyWorktree(cwd: string, worktree: TaskWorktree): Promise<string> {
  await worktreeParent(cwd);
  const path = worktreePath(cwd, worktree);
  if (
    !(await lstat(path)).isDirectory() ||
    (await commonGitDirectory(path)) !== (await commonGitDirectory(cwd)) ||
    (await gitOutput(path, ["rev-parse", "HEAD"])) !== worktree.base
  )
    throw new UserError(
      "The task worktree was moved or its Git state changed.",
      `Restore ${path} at its saved base before resuming. Preserve its changes.`,
    );
  return path;
}

export async function prepareWorktree(
  context: RunContext,
  state: TaskState,
  base: string,
): Promise<string> {
  await worktreeParent(context.cwd);
  if (!state.worktree || state.worktree.integrated) {
    if (state.completedSteps > 0)
      throw new UserError(
        "Partial progress has no isolated worktree.",
        "Resume this older checkpoint in sequential mode before enabling parallel execution.",
      );
    const worktree = { id: randomUUID(), base };
    const path = worktreePath(context.cwd, worktree);
    await gitOutput(context.cwd, ["worktree", "add", "--detach", path, base], {
      signal: context.signal,
    });
    state.worktree = worktree;
    await context.update(state);
  }
  const path = await verifyWorktree(context.cwd, state.worktree);
  if (state.worktree.resolving) await requireResolvedWorktree(path);
  await copyWorktreeSettings(context, path);
  context.ui.log(`Task ${state.id} worktree: ${path}`);
  return path;
}

export async function requireResolvedWorktree(path: string): Promise<void> {
  if (
    (await gitOutput(path, ["ls-files", "-u"])) ||
    (await gitCommand(path, ["diff", "--check", "HEAD"])).code !== 0
  )
    throw new UserError(
      "The integration worktree still needs conflict resolution.",
      `Resolve and verify the files in ${path}, use git add to mark them resolved, then rerun the same Maestrun command from the project.`,
    );
}

export function uniqueWorktrees(tasks: readonly TaskState[]): boolean {
  const ids = tasks.flatMap((task) => (task.worktree ? worktreeIds(task.worktree) : []));
  return new Set(ids).size === ids.length;
}

function worktreeIds(worktree: TaskWorktree): string[] {
  return [
    worktree.id,
    ...(worktree.retained ?? []).map((entry) => entry.id),
    ...(worktree.repositories ?? []).flatMap((entry) => worktreeIds(entry.worktree)),
  ];
}
