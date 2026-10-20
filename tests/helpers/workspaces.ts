import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configure } from "../../src/config/index.js";
import { initializeGit, setupRun } from "./run.js";

export async function setupWorkspace(cwd: string): Promise<void> {
  await setupRun(cwd);
  await configure(cwd, ["execution", "parallel"]);
  await configure(cwd, ["execution.repositories", '["api", "apps/web"]']);
  for (const path of ["api", "apps/web"]) {
    await mkdir(join(cwd, path), { recursive: true });
    await writeFile(join(cwd, path, "base.txt"), "baseline\n");
    initializeGit(join(cwd, path));
  }
}
