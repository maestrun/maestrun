import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { RunReport } from "../../src/contracts/run.js";
import { runWorkflow, stepResult, taskBody } from "../../src/modules/execution/index.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
import { executionProcesses } from "../helpers/execution-processes.js";

function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    tasksPath: "tasks.json",
    signal: new AbortController().signal,
    ui: scriptedUi([]).ui,
  };
}

async function report(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}

test("collects actual session events per task in parallel and renders final usage", async ({
  project,
}) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, execution: { mode: "parallel", concurrency: 2 } });
  const systemPath = process.env.PATH;
  await executionProcesses(project);
  vi.stubEnv("PATH", `${project.bin}:${systemPath}`);
  const ui = scriptedUi([]);
  await runWorkflow({ ...input(project.cwd), ui: ui.ui });
  const saved = await report(project.cwd);
  for (const task of saved.tasks) {
    expect(task.tokenUsage).toEqual({ inputTokens: 1700, outputTokens: 150 });
    expect(task.tokenUsageIncomplete).toBeUndefined();
    expect(task.steps?.map((step) => step.tokenUsage)).toEqual([
      { inputTokens: 1000, outputTokens: 100 },
      { inputTokens: 700, outputTokens: 50 },
    ]);
  }
  expect(ui.messages.join("\n")).toContain("in: 1700 · out: 150");
  const body = taskBody(
    saved,
    { filter: 0, selected: "a", details: true, scroll: 0, follow: true },
    { width: 100, height: 100 },
  );
  expect(body.at(-1)).toBe("in: 1700 · out: 150");
});

test("retains failed attempts, repair usage and totals across resume", async ({ project }) => {
  await setupRun(project.cwd);
  await expect(
    runWorkflow(input(project.cwd), async (step) => {
      step.onUsage?.({ inputTokens: 10, outputTokens: 2 });
      if (step.task.id === "a" && step.stage.id === "testing")
        return stepResult('{"status":"failed","summary":"Needs repair"}');
      return "Done";
    }),
  ).rejects.toThrow();
  expect((await report(project.cwd)).tasks[0]?.tokenUsage).toEqual({
    inputTokens: 120,
    outputTokens: 24,
  });
  await runWorkflow(input(project.cwd), async (step) => {
    step.onUsage?.({ inputTokens: 5, outputTokens: 1 });
    return "Fixed";
  });
  const saved = await report(project.cwd);
  expect(saved.tasks.map((task) => task.tokenUsage)).toEqual([
    { inputTokens: 125, outputTokens: 25 },
    { inputTokens: 10, outputTokens: 2 },
    { inputTokens: 20, outputTokens: 4 },
  ]);
  expect(saved.tasks[0]?.steps?.map((step) => step.tokenUsage)).toEqual([
    { inputTokens: 60, outputTokens: 12 },
    { inputTokens: 65, outputTokens: 13 },
  ]);
});

test("marks mixed usage partial and rejects corrupted persisted counters", async ({ project }) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async (step) => {
    if (step.stage.id === "testing") step.onUsage?.({ inputTokens: 5, outputTokens: 1 });
    return "Done";
  });
  const saved = await report(project.cwd);
  expect(saved.tasks[0]).toMatchObject({
    tokenUsage: { inputTokens: 5, outputTokens: 1 },
    tokenUsageIncomplete: true,
    steps: [{ tokenUsageIncomplete: true }, { tokenUsage: { inputTokens: 5, outputTokens: 1 } }],
  });
  const task = saved.tasks[0];
  if (!task) throw new Error("Missing task");
  task.tokenUsage = { inputTokens: -1, outputTokens: 1 };
  await writeFile(join(project.cwd, ".maestrun/run.json"), JSON.stringify(saved));
  await expect(runWorkflow(input(project.cwd))).rejects.toThrow("invalid token usage");
});

test("keeps old task totals without inventing a step breakdown and rejects invalid step usage", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async (step) => {
    step.onUsage?.({ inputTokens: 10, outputTokens: 2 });
    return "Done";
  });
  const saved = await report(project.cwd);
  const task = saved.tasks[0];
  if (!task?.steps?.[0]) throw new Error("Missing task steps");
  for (const step of task.steps) delete step.tokenUsage;
  const path = join(project.cwd, ".maestrun/run.json");
  await writeFile(path, JSON.stringify(saved));
  await runWorkflow(input(project.cwd), async () => {
    throw new Error("Already completed");
  });
  const restored = (await report(project.cwd)).tasks[0];
  expect(restored?.tokenUsage).toEqual({ inputTokens: 20, outputTokens: 4 });
  expect(restored?.steps?.every((step) => !step.tokenUsage && step.tokenUsageIncomplete)).toBe(
    true,
  );
  task.steps[0].tokenUsage = { inputTokens: -1, outputTokens: 2 };
  await writeFile(path, JSON.stringify(saved));
  await expect(runWorkflow(input(project.cwd))).rejects.toThrow("inconsistent step history");
});
