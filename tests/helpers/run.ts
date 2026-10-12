import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { saveConfig } from "../../src/config/index.js";
import type { Config } from "../../src/contracts/workflow.js";
import type { Task } from "../../src/contracts/tasks.js";
import { CONFIG } from "./context.js";

export const RUN_CONFIG: Config = {
  ...CONFIG,
  stages: [
    ...CONFIG.stages,
    { id: "implementation", executor: "codex", model: "code-test" },
    { id: "testing", executor: "claude", model: "qa-test" },
  ],
};
export const TASKS: readonly Task[] = [
  { id: "a", title: "A", instructions: "Implement A", dependsOn: [] },
  { id: "b", title: "B", instructions: "Implement B", dependsOn: ["a"] },
  { id: "c", title: "C", instructions: "Implement C", dependsOn: [] },
];

export async function setupRun(cwd: string, config: Config = RUN_CONFIG): Promise<void> {
  await saveConfig(cwd, config, { exists: false, content: "" });
  await writeFile(join(cwd, "tasks.json"), JSON.stringify({ version: 1, tasks: TASKS }));
  if (config.execution?.mode === "parallel") initializeGit(cwd);
}

export function initializeGit(cwd: string): void {
  const git = (args: string[]): void => {
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, stdio: "pipe" });
  };
  git(["init", "--quiet"]);
  git(["add", "--all"]);
  git([
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@localhost",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "Baseline",
  ]);
}
