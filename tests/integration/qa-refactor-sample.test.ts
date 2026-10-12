import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import {
  loadTasks,
  runWorkflow,
  stepResult,
  taskFlowchart,
} from "../../src/modules/execution/index.js";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import { setupRun } from "../helpers/run.js";
import { scriptedUi } from "../helpers/ui.js";
import { test } from "../helpers/project.js";

const SAMPLE = fileURLToPath(new URL("../../examples/qa-refactor/", import.meta.url));
const STAGES = ["implementation", "testing", "qa", "review"];

async function readReport(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}

test("sample runs three tasks and QA sends the second back through Tests and QA", async ({
  project,
}) => {
  const { config } = await loadConfig(SAMPLE);
  if (!config) throw new Error("Missing sample config");
  const tasks = await loadTasks(SAMPLE, "plan.md");
  expect(tasks).toHaveLength(3);
  await setupRun(project.cwd, config);
  await writeFile(join(project.cwd, "tasks.json"), JSON.stringify({ version: 1, tasks }));
  const calls: string[] = [];
  await runWorkflow(
    {
      cwd: project.cwd,
      tasksPath: "tasks.json",
      signal: new AbortController().signal,
      ui: scriptedUi([]).ui,
    },
    async (input) => simulateStep(project.cwd, input, calls),
  );
  expect(calls).toEqual([
    ...STAGES.map((stage) => `sample-add:${stage}`),
    ...STAGES.slice(0, 3).map((stage) => `sample-clamp:${stage}`),
    ...STAGES.map((stage) => `sample-clamp:${stage}`),
    ...STAGES.map((stage) => `sample-cli:${stage}`),
  ]);
  const report = await readReport(project.cwd);
  expect(
    report.tasks.every((task) => task.status === "completed" && task.completedSteps === 4),
  ).toBe(true);
});

async function simulateStep(cwd: string, input: StepInput, calls: string[]): Promise<string> {
  calls.push(`${input.task.id}:${input.stage.id}`);
  if (input.stage.id === "implementation") expect(input.previousResults).toEqual([]);
  if (input.stage.id === "qa" || input.stage.id === "review")
    expect(input.previousResults).toContainEqual({
      stage: "testing",
      summary: input.feedback ? "Repaired tests: 3 passed" : "Initial tests: 2 passed",
    });
  if (input.stage.id === "testing")
    return input.feedback ? "Repaired tests: 3 passed" : "Initial tests: 2 passed";
  if (input.task.id === "sample-clamp" && input.stage.id === "qa" && !input.feedback)
    return stepResult('{"status":"refactor","summary":"clamp.mjs omits the required upper bound"}');
  if (input.task.id === "sample-clamp" && input.stage.id === "implementation" && input.feedback) {
    expect(input.feedback).toContain("upper bound");
    const report = await readReport(cwd);
    const task = report.tasks[1];
    expect(task?.steps?.map((step) => step.status)).toEqual([
      "running",
      "pending",
      "refactor",
      "pending",
    ]);
    const flow = taskFlowchart(task, { width: 50, height: 30 }).join("\n");
    expect(flow).toContain("┌──▶");
    expect(flow).toContain("Tests");
    expect(flow).toContain("QA");
  }
  return "Simulated stage completed";
}
