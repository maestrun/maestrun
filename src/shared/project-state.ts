import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, hasCode, snapshotFile } from "./atomic.js";
import { UserError } from "./errors.js";

const DEFAULT_IGNORE = [
  "# Only shared configuration and step instructions belong in Git.",
  "*",
  "!/.gitignore",
  "!/config.json",
  "!/layout.json",
  "!/steps/",
  "!/steps/*.md",
  "",
].join("\n");

export async function ensureStateDirectory(cwd: string): Promise<void> {
  await validateStateDirectory(cwd);
  const path = join(cwd, ".maestrun", ".gitignore");
  const saved = await snapshotFile(path);
  const privateFiles = "/samples/\n/logs/\n*.log\n*.log.*\n";
  const content = saved.exists ? saved.content : DEFAULT_IGNORE;
  if (!content.endsWith(privateFiles))
    await atomicWrite(
      path,
      `${content}${content.endsWith("\n") ? "" : "\n"}${privateFiles}`,
      saved,
    );

  const rootPath = join(cwd, ".gitignore");
  const root = await snapshotFile(rootPath);
  if (!root.content.split(/\r?\n/u).includes("/plan.md"))
    await atomicWrite(
      rootPath,
      `${root.content}${root.content && !root.content.endsWith("\n") ? "\n" : ""}/plan.md\n`,
      root,
    );
}

export async function validateStateDirectory(cwd: string): Promise<void> {
  try {
    if (!(await lstat(join(cwd, ".maestrun"))).isDirectory())
      throw new UserError(
        ".maestrun must be a directory, not a file or symlink.",
        "Move it aside and run maestrun init again.",
      );
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    if (error instanceof UserError) throw error;
    throw new UserError("Could not read .maestrun.", "Check its directory permissions.");
  }
}
