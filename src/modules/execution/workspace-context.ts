import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { UserError } from "../../shared/errors.js";
import { hasCode } from "../../shared/atomic.js";
import { WORKSPACE_EXCLUDES, workspaceEntries } from "./workspace-repositories.js";

async function contextFiles(
  root: string,
  repositories: readonly string[],
  options: { path?: string; skipUnreadable?: boolean; scoped?: boolean } = {},
): Promise<string[]> {
  const files: string[] = [];
  const path = options.path ?? "";
  for (const entry of await workspaceEntries(
    join(root, path),
    options.skipUnreadable && Boolean(path),
  )) {
    const child = path ? `${path}/${entry.name}` : entry.name;
    if (
      repositories.includes(child) ||
      [".git", ".maestrun"].includes(entry.name) ||
      WORKSPACE_EXCLUDES.has(entry.name) ||
      (options.scoped &&
        entry.isDirectory() &&
        !repositories.some((repo) => repo.startsWith(`${child}/`)))
    )
      continue;
    if (entry.isDirectory())
      files.push(...(await contextFiles(root, repositories, { ...options, path: child })));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(child);
  }
  return files.sort();
}

export async function workspaceContextHash(
  root: string,
  repositories: readonly string[],
): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await contextFiles(root, repositories)) {
    const path = join(root, file);
    const metadata = await lstat(path);
    hash.update(file).update("\0").update(String(metadata.mode)).update("\0");
    hash.update(
      createHash("sha256")
        .update(metadata.isSymbolicLink() ? await readlink(path) : await readFile(path))
        .digest(),
    );
  }
  return hash.digest("hex");
}

export async function copyWorkspaceContext(
  source: string,
  destination: string,
  options: { repositories: readonly string[]; scoped?: boolean },
): Promise<string> {
  const { repositories, scoped } = options;
  await safeWorkspaceDirectory(destination);
  for (const file of await contextFiles(source, repositories, {
    skipUnreadable: true,
    scoped: Boolean(scoped),
  })) {
    if (!(await readableContextFile(join(source, file)))) continue;
    const target = join(destination, file);
    await safeWorkspaceDirectory(dirname(target));
    await copyFile(join(source, file), target);
  }
  return workspaceContextHash(destination, repositories);
}

async function readableContextFile(path: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isFile()) return false;
    await access(path, constants.R_OK);
    return true;
  } catch (error) {
    if (hasCode(error, "EACCES") || hasCode(error, "EPERM")) return false;
    throw error;
  }
}

export async function safeWorkspaceDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  if ((await realpath(path)) !== resolve(path))
    throw new UserError(
      "The isolated workspace contains a symbolic link.",
      "Restore its original directories before resuming.",
    );
}
