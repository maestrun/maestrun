import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { UserError } from "../../shared/errors.js";
import { WORKSPACE_EXCLUDES } from "./workspace-repositories.js";

async function contextFiles(
  root: string,
  repositories: readonly string[],
  path = "",
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const child = path ? `${path}/${entry.name}` : entry.name;
    if (
      repositories.includes(child) ||
      [".git", ".maestrun"].includes(entry.name) ||
      WORKSPACE_EXCLUDES.has(entry.name)
    )
      continue;
    if (entry.isDirectory()) files.push(...(await contextFiles(root, repositories, child)));
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
  repositories: readonly string[],
): Promise<string> {
  await safeWorkspaceDirectory(destination);
  for (const file of await contextFiles(source, repositories)) {
    if (!(await lstat(join(source, file))).isFile()) continue;
    const target = join(destination, file);
    await safeWorkspaceDirectory(dirname(target));
    await copyFile(join(source, file), target);
  }
  return workspaceContextHash(destination, repositories);
}

export async function safeWorkspaceDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  if ((await realpath(path)) !== resolve(path))
    throw new UserError(
      "The isolated workspace contains a symbolic link.",
      "Restore its original directories before resuming.",
    );
}
