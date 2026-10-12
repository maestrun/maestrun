import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { UserError, fileFailure } from "./errors.js";

export type FileSnapshot = Readonly<{ exists: boolean; content: string }>;

export async function snapshotFile(path: string): Promise<FileSnapshot> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile())
      throw fileFailure(`${basename(path)} must be a regular file, not a directory or symlink.`);
    return { exists: true, content: await readFile(path, "utf8") };
  } catch (error) {
    if (hasCode(error, "ENOENT")) return { exists: false, content: "" };
    if (error instanceof UserError) throw error;
    throw fileFailure(`Could not read ${basename(path)}.`);
  }
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export async function atomicWrite(
  path: string,
  content: string,
  expected: FileSnapshot,
): Promise<void> {
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let created = false;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    created = true;
    const current = await snapshotFile(path);
    if (current.exists !== expected.exists || current.content !== expected.content) {
      throw new UserError(
        `${basename(path)} changed during the command.`,
        "Review the file and retry the command.",
      );
    }
    if (expected.exists) await rename(temporary, path);
    else await link(temporary, path);
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw fileFailure(`Could not save ${basename(path)}. Existing files were preserved.`);
  } finally {
    if (created) await rm(temporary, { force: true });
  }
}
