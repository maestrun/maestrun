import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { Config } from "../../src/contracts/workflow.js";
import type { RunReport } from "../../src/contracts/run.js";
import { ORCHESTRATOR_ID, runWorkflow, loadTasks } from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "research-model", effort: "high" }],
  execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
};
const PLAN = `## Tasks

### Task research: Research a topic
- Depends on: none
- Steps: custom:Research, custom:Write report

#### Research
Gather sources.
#### Write report
Summarize the evidence.

### Task audit: Check the report
- Depends on: research
- Steps: custom:Fact check

Verify the report's sources.
`;

function input(cwd: string) {
  return { cwd, ui: scriptedUi([]).ui, signal: new AbortController().signal };
}

test.for(["sequential", "parallel"] as const)(
  "%s execution uses edited per-task steps and resumes them",
  async (mode, { project }) => {
    await setupRun(project.cwd, {
      ...CONFIG,
      execution: { mode, concurrency: 2, orchestrator: "plan" },
    });
    await writeFile(
      join(project.cwd, "plan.md"),
      PLAN.replace("custom:Write report", "custom:Summarize"),
    );
    const calls: string[] = [];
    await runWorkflow(input(project.cwd), async ({ task, stage }) => {
      calls.push(`${task.id}:${stage.id}`);
      expect(stage).toMatchObject({ executor: "codex", model: "research-model", effort: "high" });
      return "Verified evidence";
    });
    expect(calls).toEqual([
      "research:custom:Research",
      "research:custom:Summarize",
      "audit:custom:Fact check",
    ]);
    await expectResumed(project.cwd);
  },
);

test("agent coordinates a planned workflow and creates new custom follow-up steps", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...CONFIG,
    execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" },
  });
  await writeFile(join(project.cwd, "plan.md"), PLAN);
  const tasks = await loadTasks(project.cwd, "plan.md");
  const followup = {
    ...tasks[1],
    id: "publish",
    steps: ["custom:Prepare publication"],
  };
  const calls: string[] = [];
  let round = 0;
  await runWorkflow(input(project.cwd), async ({ task, stage }) => {
    calls.push(`${task.id}:${stage.id}`);
    if (task.id !== ORCHESTRATOR_ID) return "Done";
    expect(task.instructions).toContain("Custom steps do not need to be registered");
    round++;
    return JSON.stringify(
      round === 3
        ? { done: true }
        : { done: false, tasks: round === 1 ? tasks : [...tasks, followup] },
    );
  });
  expect(calls).toContain("publish:custom:Prepare publication");
  expect(calls).not.toContain("research:implementation");
});

test("editing steps after execution starts preserves the existing checkpoint", async ({
  project,
}) => {
  await setupRun(project.cwd, CONFIG);
  await writeFile(join(project.cwd, "plan.md"), PLAN);
  await runWorkflow(input(project.cwd), async () => "Done");
  const path = join(project.cwd, ".maestrun/run.json");
  const original = await readFile(path, "utf8");
  await writeFile(join(project.cwd, "plan.md"), PLAN.replace("custom:Research", "custom:Explore"));
  const execute = vi.fn();
  await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow("source plan changed");
  expect(execute).not.toHaveBeenCalled();
  expect(await readFile(path, "utf8")).toBe(original);
});

async function expectResumed(cwd: string): Promise<void> {
  const saved: RunReport = JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8"));
  expect(saved.tasks.map((task) => task.totalSteps)).toEqual([1, 2, 1]);
  const execute = vi.fn();
  const script = scriptedUi([]);
  await runWorkflow({ ...input(cwd), ui: script.ui, dryRun: true }, execute);
  expect(script.messages.join("\n")).not.toContain("research-model");
  await runWorkflow(input(cwd), execute);
  expect(execute).not.toHaveBeenCalled();
}
