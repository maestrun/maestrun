import { lstat, readdir, realpath } from "node:fs/promises";
import { validRepositoryPath, validRepositorySelection } from "../../contracts/workspace.js";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";
import { hasCode } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { checkWorktreeRepository, gitCommand } from "./worktree-git.js";

export const WORKSPACE_EXCLUDES = new Set(["node_modules", "vendor", "dist", "build", "coverage"]);
export type RepositoryBase = { path: string; base: string };

export { validRepositoryPath } from "../../contracts/workspace.js";

export async function checkWorkspaceRepositories(
  cwd: string,
  selected?: readonly string[],
): Promise<RepositoryBase[]> {
  if (selected !== undefined && !validRepositorySelection(selected))
    throw new UserError(
      "Invalid repository selection.",
      "Choose unique, non-overlapping repository paths inside the workspace.",
    );
  const paths = selected ?? (await discoverWorkspaceRepositories(cwd));
  if (paths[0] === ".") return [{ path: ".", base: await checkWorktreeRepository(cwd) }];
  if (!selected)
    throw new UserError(
      "Choose repositories for this workspace before parallel execution.",
      "Run maestrun run interactively, or set execution.repositories to the relative paths belonging to this project.",
    );
  const repositories: RepositoryBase[] = [];
  for (const path of paths) repositories.push(await checkChildRepository(cwd, path));
  return repositories;
}

export async function discoverWorkspaceRepositories(cwd: string): Promise<string[]> {
  const root = await gitCommand(cwd, ["rev-parse", "--show-toplevel"], { env: { LC_ALL: "C" } });
  if (root.code === 0 || !root.stderr.includes("not a git repository")) return ["."];
  const paths = await findRepositories(cwd);
  return paths.length ? paths : ["."];
}

async function checkChildRepository(cwd: string, path: string): Promise<RepositoryBase> {
  try {
    await verifyRepositoryPath(cwd, path);
    return { path, base: await checkWorktreeRepository(join(cwd, path)) };
  } catch (error) {
    if (hasCode(error, "ENOENT") || hasCode(error, "EACCES") || hasCode(error, "EPERM"))
      throw new UserError(
        `Repository ${path} is missing or inaccessible.`,
        "Restore the selected repository or update execution.repositories before running.",
      );
    if (error instanceof UserError)
      throw new UserError(`Repository ${path}: ${error.message}`, error.nextAction);
    throw error;
  }
}

async function findRepositories(root: string, path = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await workspaceEntries(join(root, path), Boolean(path))) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || WORKSPACE_EXCLUDES.has(entry.name))
      continue;
    const child = path ? `${path}/${entry.name}` : entry.name;
    try {
      const marker = join(root, child, ".git");
      const metadata = await lstat(marker);
      if (metadata.isDirectory() && !(await readdir(marker)).length)
        found.push(...(await findRepositories(root, child)));
      else found.push(child);
    } catch (error) {
      if (hasCode(error, "EACCES") || hasCode(error, "EPERM")) continue;
      if (!hasCode(error, "ENOENT")) throw error;
      found.push(...(await findRepositories(root, child)));
    }
  }
  return found.sort();
}

export async function workspaceEntries(path: string, skipUnreadable = false): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (skipUnreadable && (hasCode(error, "EACCES") || hasCode(error, "EPERM"))) return [];
    throw error;
  }
}

export async function verifyRepositoryPath(cwd: string, path: string): Promise<void> {
  if (
    !validRepositoryPath(path) ||
    relative(await realpath(cwd), await realpath(join(cwd, path))) !== path
  )
    throw new UserError(
      "A workspace repository path changed or is unsafe.",
      "Restore the original repository directories before resuming.",
    );
}
