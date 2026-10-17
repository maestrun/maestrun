import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import type { Config } from "../../src/contracts/workflow.js";
import { ORCHESTRATOR_ID, runWorkflow, worktreePath } from "../../src/modules/execution/index.js";
import { RefactorError, UserError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const tasks = [
  { id: "accept", title: "Accept", dependsOn: [], steps: ["qa"], instructions: "Review only." },
];
const repair = {
  id: "fix",
  title: "Fix",
  dependsOn: [],
  steps: ["implementation"],
  repairFor: "accept",
  instructions: "Fix then verify.",
};
const config: Config = {
  ...RUN_CONFIG,
  execution: { mode: "parallel", concurrency: 2, orchestrator: "agent", maxRepairs: 0 },
};
const input = (cwd: string) => ({
  cwd,
  tasksPath: "tasks.json",
  ui: scriptedUi([]).ui,
  signal: new AbortController().signal,
});
const saved = async (cwd: string): Promise<RunReport> =>
  JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8"));

async function failedReview(cwd: string) {
  await setupRun(cwd, config);
  await writeFile(join(cwd, "tasks.json"), JSON.stringify({ version: 1, tasks }));
  await expect(
    runWorkflow(input(cwd), async (step) => {
      if (step.task.id === ORCHESTRATOR_ID) return JSON.stringify({ done: false, tasks });
      await writeFile(join(step.cwd, "notes.txt"), "Prior review evidence");
      throw new RefactorError("API and visual inspection need fixes", "Send to specialists");
    }),
  ).rejects.toThrow("tasks completed");
  await writeFile(
    join(cwd, ".maestrun/config.json"),
    JSON.stringify({ ...config, execution: { ...config.execution, maxRepairs: 1 } }),
  );
}

function decision(step: StepInput): string {
  return JSON.stringify(
    step.stage.id === "custom:Coordinate 3"
      ? { done: true }
      : { done: false, tasks: [...tasks, repair] },
  );
}

test("a saved QA-only failure resumes at coordination, and repair failure can resume without redoing finished work", async ({
  project,
}) => {
  await failedReview(project.cwd);
  const calls: string[] = [];
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      calls.push(`${step.task.id}:${step.stage.id}`);
      if (step.task.id === ORCHESTRATOR_ID) return decision(step);
      throw new UserError("Executor unavailable", "Retry");
    }),
  ).rejects.toThrow("tasks completed");
  expect(calls).toEqual(["__orchestrator__:custom:Coordinate 2", "fix:implementation"]);
  await runWorkflow(input(project.cwd), async (step) => {
    if (step.task.id === ORCHESTRATOR_ID) return decision(step);
    if (step.task.id === "fix") await writeFile(join(step.cwd, "fixed.txt"), "Verified repair");
    else {
      expect(await readFile(join(step.cwd, "fixed.txt"), "utf8")).toBe("Verified repair");
      expect(await readFile(join(step.cwd, "notes.txt"), "utf8")).toBe("Prior review evidence");
    }
    return "Verified";
  });
  expect((await saved(project.cwd)).orchestration?.phase).toBe("complete");
});

test("coordinated repairs stop at the configured limit", async ({ project }) => {
  await failedReview(project.cwd);
  const calls: string[] = [];
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      calls.push(step.task.id);
      if (step.task.id === ORCHESTRATOR_ID) return decision(step);
      if (step.task.id === "accept") throw new RefactorError("Still invalid", "Repair");
      return "Repaired";
    }),
  ).rejects.toThrow("tasks completed");
  expect(calls).toEqual(["__orchestrator__", "fix", "accept"]);
  expect((await saved(project.cwd)).orchestration?.repairRounds).toBe(1);
});

test("conflicting review work is preserved instead of overwritten by a repair", async ({
  project,
}) => {
  await failedReview(project.cwd);
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      if (step.task.id === ORCHESTRATOR_ID) return decision(step);
      if (step.task.id === "accept") throw new Error("Must resolve conflict before QA");
      await writeFile(join(step.cwd, "notes.txt"), "Conflicting repair evidence");
      return "Repaired";
    }),
  ).rejects.toThrow("Integration conflict");
  const state = (await saved(project.cwd)).tasks.find((task) => task.id === "accept");
  expect(state?.worktree?.resolving).toBe(true);
  const original = state?.worktree?.retained?.[0];
  if (!original) throw new Error("Missing retained review");
  expect(await readFile(join(worktreePath(project.cwd, original), "notes.txt"), "utf8")).toBe(
    "Prior review evidence",
  );
});
