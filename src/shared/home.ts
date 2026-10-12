import os from "node:os";
import { mkdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { UserError } from "./errors.js";

export function maestrunHome(): string {
  return join(os.homedir(), ".maestrun");
}

export async function ensureHomeDirectory(...parts: string[]): Promise<string> {
  let directory = maestrunHome();
  for (const part of ["", ...parts]) {
    directory = join(directory, part);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(directory)).isDirectory())
      throw new UserError(
        `${directory} must be a regular directory.`,
        "Move the file or symlink aside and retry.",
      );
  }
  return directory;
}
