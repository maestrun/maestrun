import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "../../src/contracts/tasks.js";
import type { Draft, Config } from "../../src/contracts/workflow.js";
import { saveConfig } from "../../src/config/index.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { RUN_CONFIG, TASKS, setupRun } from "./run.js";
import { scriptedUi } from "./ui.js";

export const REPLAN_CONFIG: Config = {
  ...RUN_CONFIG,
  stages: [...RUN_CONFIG.stages, { id: "review", executor: "codex", model: "code-test" }],
};
export function taskMarkdown(tasks: readonly Task[] = TASKS): string {
  return tasks
    .map(
      (task) =>
        `### Task ${task.id}: ${task.title}\n\n- Depends on: ${task.dependsOn.join(", ") || "none"}\n${task.target ? `- Target: ${task.target}\n` : ""}\n${task.instructions}`,
    )
    .join("\n\n");
}
export function planContent(mode: Draft["planMode"], tasks: readonly Task[] = TASKS): string {
  const content = taskMarkdown(tasks);
  return mode === "advanced"
    ? `<!-- maestrun:prd -->\n# PRD\nRequirements\n<!-- maestrun:techspec -->\n# TechSpec\nDesign\n<!-- maestrun:tasks -->\n# Tasks\n${content}`
    : content;
}
export function runInput(cwd: string): Parameters<typeof runWorkflow>[0] {
  return { cwd, signal: new AbortController().signal, ui: scriptedUi([]).ui };
}
export async function setupReplan(cwd: string): Promise<void> {
  await setupRun(cwd);
  await writeFile(join(cwd, "plan.md"), taskMarkdown());
  await runWorkflow(runInput(cwd), async () => "Done");
  await saveConfig(cwd, REPLAN_CONFIG, await snapshotFile(join(cwd, ".maestrun/config.json")));
}
export async function generateReplan(
  cwd: string,
  mode: Draft["planMode"] = "simple",
  generate?: NonNullable<Parameters<typeof createPlan>[1]>["generate"],
): Promise<void> {
  await createPlan(runInput(cwd), {
    wizard: async () => ({
      config: REPLAN_CONFIG,
      requirements: { text: "Update workflow", source: "Pasted text" },
      planMode: mode,
      planFolder: "replanned",
    }),
    detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }),
    generate: generate ?? (async () => planContent(mode)),
  });
}
export async function savedFiles(cwd: string): Promise<readonly string[]> {
  return Promise.all(
    ["plan.md", ".maestrun/run.json"].map((path) => readFile(join(cwd, path), "utf8")),
  );
}
