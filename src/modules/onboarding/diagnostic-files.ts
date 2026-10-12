import { checkProjectFile } from "../../shared/project-file.js";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Config } from "../../contracts/workflow.js";
import { hasCode } from "../../shared/atomic.js";
import { readSession, workerAlive } from "../execution/index.js";

export type Diagnostic = {
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
  nextAction?: string;
};

export async function diagnoseFiles(cwd: string, config: Config): Promise<Diagnostic[]> {
  const paths = new Set([
    ...config.stages.flatMap((stage) => (stage.file ? [stage.file] : [])),
    ...(config.plugins ?? []),
  ]);
  const checks: Diagnostic[] = [];
  for (const path of paths) {
    try {
      await checkProjectFile(cwd, path);
      checks.push({ name: path, status: "ok", detail: "Project file is available" });
    } catch {
      checks.push({
        name: path,
        status: "error",
        detail: "Referenced file is missing or unsafe",
        nextAction: `Copy ${path} into the project or remove its stage/plugin reference with maestrun config.`,
      });
    }
  }
  if (config.plugins?.length)
    checks.push({
      name: "Plugins",
      status: "warning",
      detail: "Plugin code and dependencies have not been executed or validated",
      nextAction:
        "Install the extension's documented dependencies, review its code, then use --trust-plugins for the run.",
    });
  return checks;
}

export async function diagnoseLocks(cwd: string): Promise<Diagnostic[]> {
  const checks: Diagnostic[] = [];
  const session = await readSession(cwd);
  if (session?.status === "running")
    checks.push({
      name: "Session",
      status: "error",
      detail: workerAlive(session) ? "Execution is active" : "The saved worker has stopped",
      nextAction: workerAlive(session)
        ? "Run maestrun to reconnect."
        : "Inspect .maestrun/run.log; confirm executors stopped before removing session.json and stale locks. Preserve run.json.",
    });
  for (const name of ["session.lock", "run.lock"]) {
    try {
      await lstat(resolve(cwd, ".maestrun", name));
      checks.push({
        name,
        status: "error",
        detail: "Execution lock exists",
        nextAction:
          "Reconnect with maestrun if active. Otherwise confirm the worker and executors stopped before removing this lock; preserve .maestrun/run.json.",
      });
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
  return checks;
}
