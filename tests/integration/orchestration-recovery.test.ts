import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import {
  runWorkflow,
  ORCHESTRATOR_ID,
  answerTaskInput,
} from "../../src/modules/execution/index.js";
import { previousPlan } from "../../src/modules/planning/index.js";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import { StepInputRequired, UserError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun, TASKS } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const config = {
  ...RUN_CONFIG,
  execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" },
} as const;
function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    ui: scriptedUi([]).ui,
    signal: new AbortController().signal,
    tasksPath: "tasks.json",
  };
}
async function saved(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}
function execute({ task, stage }: StepInput): Promise<string> {
  return Promise.resolve(
    task.id !== ORCHESTRATOR_ID
      ? "Done"
      : JSON.stringify(
          stage.id === "custom:Coordinate 1" ? { done: false, tasks: TASKS } : { done: true },
        ),
  );
}

test("invalid coordinator output can be retried without resetting the report", async ({
  project,
}) => {
  await setupRun(project.cwd, config);
  await expect(runWorkflow(input(project.cwd), async () => "bad decision")).rejects.toThrow(
    "decision JSON",
  );
  await runWorkflow(input(project.cwd), execute);
  expect((await saved(project.cwd)).orchestration?.phase).toBe("complete");
});

test("agent resumes child failure from its saved dynamic plan without repeating coordination", async ({
  project,
}) => {
  await setupRun(project.cwd, config);
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      if (step.task.id === "a") throw new UserError("Unavailable", "Retry");
      return execute(step);
    }),
  ).rejects.toThrow("tasks completed");
  const calls: string[] = [];
  await runWorkflow(input(project.cwd), async (step) => {
    calls.push(`${step.task.id}:${step.stage.id}`);
    return execute(step);
  });
  expect(calls).not.toContain(`${ORCHESTRATOR_ID}:custom:Coordinate 1`);
  expect(calls).not.toContain("c:implementation");
  expect(calls).toContain(`${ORCHESTRATOR_ID}:custom:Coordinate 2`);
});

test("coordinator question is saved, answered and resumed in the same round", async ({
  project,
}) => {
  await setupRun(project.cwd, config);
  let asked = false;
  const run = runWorkflow(input(project.cwd), async (step) => {
    if (step.task.id === ORCHESTRATOR_ID && !asked) {
      asked = true;
      throw new StepInputRequired("Use this scope?", "Confirm scope before decomposition.");
    }
    if (step.task.id === ORCHESTRATOR_ID && step.stage.id === "custom:Coordinate 1")
      expect(step.inputRequests?.[0]?.answer).toBe("Yes");
    return execute(step);
  });
  await vi.waitFor(async () => {
    expect((await saved(project.cwd)).tasks[0]?.status).toBe("on_hold");
  });
  const root = (await saved(project.cwd)).tasks[0];
  if (!root) throw new Error("Missing root");
  await answerTaskInput(project.cwd, root, "Yes");
  await run;
  expect((await saved(project.cwd)).tasks[0]?.status).toBe("completed");
});

test("coordinator cannot alter completed task definitions", async ({ project }) => {
  await setupRun(project.cwd, config);
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      if (step.task.id === ORCHESTRATOR_ID && step.stage.id === "custom:Coordinate 2")
        return JSON.stringify({
          done: false,
          tasks: TASKS.map((task) => ({ ...task, title: "Changed" })),
        });
      return execute(step);
    }),
  ).rejects.toThrow("changed started task");
  const report = await saved(project.cwd);
  expect(report.orchestration?.tasks).toEqual(TASKS);
  expect(report.tasks.slice(1).every((task) => task.status === "completed")).toBe(true);
});

test("source-plan and mode changes are rejected without overwriting the checkpoint", async ({
  project,
}) => {
  await setupRun(project.cwd, config);
  await runWorkflow(input(project.cwd), execute);
  const original = await saved(project.cwd);
  await writeFile(
    join(project.cwd, "tasks.json"),
    JSON.stringify({ version: 1, tasks: [{ ...TASKS[0], title: "Changed" }] }),
  );
  await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow("source plan changed");
  await writeFile(join(project.cwd, "tasks.json"), JSON.stringify({ version: 1, tasks: TASKS }));
  await writeFile(join(project.cwd, ".maestrun/config.json"), JSON.stringify(RUN_CONFIG));
  await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow("source plan changed");
  expect(await saved(project.cwd)).toEqual(original);
  await expect(previousPlan(project.cwd, { exists: false, content: "" })).rejects.toThrow(
    "saved orchestration plan",
  );
});
