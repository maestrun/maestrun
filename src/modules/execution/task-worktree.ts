import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TaskState, TaskWorktree } from "../../contracts/run.js";
import { isRecord } from "../../contracts/workflow.js";
import type { RunContext } from "./execution.types.js";
import { UserError } from "../../shared/errors.js";
import { ensureHomeDirectory, maestrunHome } from "../../shared/home.js";
import { commonGitDirectory, gitCommand, gitOutput } from "./worktree-git.js";
import { copyWorktreeSettings } from "./worktree-settings.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

function validLocation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    UUID.test(value.id) &&
    typeof value.base === "string" &&
    OID.test(value.base)
  );
}

export function validWorktree(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      validLocation(value) &&
      (value.result === undefined ||
        (typeof value.result === "string" && OID.test(value.result))) &&
      (value.integrated === undefined || typeof value.integrated === "boolean") &&
      (value.resolving === undefined || typeof value.resolving === "boolean") &&
      (value.retained === undefined ||
        (Array.isArray(value.retained) && value.retained.every(validLocation))))
  );
}

export function worktreePath(cwd: string, worktree: TaskWorktree): string {
  if (!validWorktree(worktree))
    throw new UserError(
      "Invalid saved task worktree.",
      "Restore the original .maestrun/run.json before retrying.",
    );
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
  const ids = tasks.flatMap((task) =>
    task.worktree
      ? [task.worktree.id, ...(task.worktree.retained ?? []).map((entry) => entry.id)]
      : [],
  );
  return new Set(ids).size === ids.length;
}
