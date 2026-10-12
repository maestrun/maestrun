import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import { runWorkflow, stepResult } from "../../src/modules/execution/index.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
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

test.for([
  ["implementation", "failed", "sequential"],
  ["testing", "failed", "parallel"],
  ["review", "refactor", "sequential"],
] as const)(
  "repairs %s %s results in %s mode and reruns downstream stages",
  async ([stage, status, mode], { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode, concurrency: 2 },
      stages: [...RUN_CONFIG.stages, { id: "review", executor: "codex", model: "review-test" }],
    });
    const calls: StepInput[] = [];
    await runWorkflow(input(project.cwd), async (step) => {
      calls.push(step);
      if (step.task.id === "a" && step.stage.id === stage && !step.feedback)
        return stepResult(JSON.stringify({ status, summary: "9-4 returned -5 instead of 5" }));
      if (step.task.id === "a" && step.stage.id === "implementation" && step.feedback)
        expect((await report(project.cwd)).tasks[0]).toMatchObject({
          completedSteps: 0,
          steps: [
            { status: "running" },
            { status: stage === "testing" ? "refactor" : "pending" },
            { status: stage === "review" ? "refactor" : "pending" },
          ],
        });
      return "Verified";
    });
    verifyRepair(calls, stage);
    expect(
      (await report(project.cwd)).tasks.every(
        (task) => task.status === "completed" && task.completedSteps === 3 && !task.error,
      ),
    ).toBe(true);
  },
);

function verifyRepair(calls: StepInput[], failed: string): void {
  const stages = ["implementation", "testing", "review"];
  const taskCalls = calls.filter((call) => call.task.id === "a");
  expect(taskCalls.map((call) => call.stage.id)).toEqual([
    ...stages.slice(0, stages.indexOf(failed) + 1),
    ...stages,
  ]);
  const repair = taskCalls.slice(-3);
  for (const call of repair) expect(call.feedback).toContain("9-4 returned -5 instead of 5");
  expect(repair[0]?.stage.model).toBe("code-test");
  expect(repair[0]?.conversationId).not.toBe(taskCalls[0]?.conversationId);
  expect(calls.findIndex((call) => call.task.id === "b")).toBeGreaterThan(
    calls.findLastIndex((call) => call.task.id === "a"),
  );
}

test.for(["failed", "refactor"])(
  "honors a configured one-repair limit for %s",
  async (status, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 1, maxRepairs: 1 },
    });
    const calls: string[] = [];
    await expect(
      runWorkflow(input(project.cwd), async ({ task, stage }) => {
        calls.push(`${task.id}:${stage.id}`);
        if (task.id === "a" && stage.id === "testing")
          return stepResult(JSON.stringify({ status, summary: "Still broken" }));
        return "Verified";
      }),
    ).rejects.toThrow("1/3 tasks completed");
    expect(calls).toEqual([
      "a:implementation",
      "a:testing",
      "a:implementation",
      "a:testing",
      "c:implementation",
      "c:testing",
    ]);
    expect((await report(project.cwd)).tasks).toMatchObject([
      { status, completedSteps: 1, error: expect.stringContaining("Still broken") },
      { status: "blocked" },
      { status: "completed" },
    ]);
    await verifyResume(project.cwd);
  },
);

async function verifyResume(cwd: string): Promise<void> {
  const resumed: StepInput[] = [];
  await runWorkflow(input(cwd), async (step) => {
    resumed.push(step);
    return "Fixed";
  });
  expect(resumed[0]).toMatchObject({
    stage: { id: "testing" },
    feedback: expect.stringContaining("Still broken"),
  });
}

test("retries the failed stage when no Implementation stage is configured", async ({ project }) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: RUN_CONFIG.stages.filter((stage) => stage.id !== "implementation"),
  });
  const calls: string[] = [];
  await runWorkflow(input(project.cwd), async ({ task, stage, feedback }) => {
    calls.push(`${task.id}:${stage.id}`);
    if (task.id === "a" && !feedback)
      return stepResult('{"status":"failed","summary":"Repair validation"}');
    return "Verified";
  });
  expect(calls).toEqual(["a:testing", "a:testing", "b:testing", "c:testing"]);
});

test("does not begin repair after cancellation even if the model reports failure", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const controller = new AbortController();
  let calls = 0;
  await expect(
    runWorkflow({ ...input(project.cwd), signal: controller.signal }, async () => {
      calls += 1;
      controller.abort();
      return stepResult('{"status":"failed","summary":"Incomplete"}');
    }),
  ).rejects.toThrow("Cancelled");
  expect(calls).toBe(1);
  expect((await report(project.cwd)).tasks.every((task) => task.status === "cancelled")).toBe(true);
});
