import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export async function checkProjectFile(cwd: string, path: string): Promise<void> {
  const root = await realpath(cwd);
  const file = await realpath(resolve(root, path));
  const local = relative(root, file);
  if (isAbsolute(local) || local === ".." || local.startsWith("../"))
    throw new Error("File is outside the project");
  if (!(await lstat(resolve(root, path))).isFile()) throw new Error("Not a regular file");
}
