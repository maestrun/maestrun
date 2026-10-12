import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { fileFailure } from "../../shared/errors.js";
import { ensureStateDirectory } from "../../shared/project-state.js";

export async function openRunLog(cwd: string): Promise<FileHandle> {
  await ensureStateDirectory(cwd);
  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const log = await open(join(cwd, ".maestrun/run.log"), flags, 0o600).catch(() => {
    throw fileFailure("Could not safely open .maestrun/run.log. Move unsafe files or links aside.");
  });
  try {
    const stat = await log.stat();
    if (!stat.isFile() || stat.nlink !== 1)
      throw fileFailure("run.log must be a regular file with no additional hard links.");
    await log.truncate(0);
    return log;
  } catch (error) {
    await log.close();
    throw error;
  }
}
