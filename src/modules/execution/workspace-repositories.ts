import { lstat, readdir, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { hasCode } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { checkWorktreeRepository, gitCommand } from "./worktree-git.js";

export const WORKSPACE_EXCLUDES = new Set(["node_modules", "vendor", "dist", "build", "coverage"]);
export type RepositoryBase = { path: string; base: string };

export function validRepositoryPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    path.split("/").every((part) => Boolean(part) && part !== "." && part !== "..")
  );
}

export async function checkWorkspaceRepositories(cwd: string): Promise<RepositoryBase[]> {
  const root = await gitCommand(cwd, ["rev-parse", "--show-toplevel"], { env: { LC_ALL: "C" } });
  if (root.code === 0 || !root.stderr.includes("not a git repository"))
    return [{ path: ".", base: await checkWorktreeRepository(cwd) }];
  const paths = await findRepositories(cwd);
  if (!paths.length) return [{ path: ".", base: await checkWorktreeRepository(cwd) }];
  const repositories: RepositoryBase[] = [];
  for (const path of paths) {
    await verifyRepositoryPath(cwd, path);
    repositories.push({ path, base: await checkWorktreeRepository(join(cwd, path)) });
  }
  return repositories;
}

async function findRepositories(root: string, path = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || WORKSPACE_EXCLUDES.has(entry.name))
      continue;
    const child = path ? `${path}/${entry.name}` : entry.name;
    try {
      await lstat(join(root, child, ".git"));
      found.push(child);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      found.push(...(await findRepositories(root, child)));
    }
  }
  return found.sort();
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
