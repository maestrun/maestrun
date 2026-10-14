import { expect, vi } from "vitest";
import type { StepInput, TaskState } from "../../src/contracts/run.js";
import {
  answerTaskInput,
  readCheckpoint,
  runWorkflow,
  stepResult,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { runInput } from "../helpers/worktrees.js";

async function held(cwd: string): Promise<TaskState> {
  await vi.waitFor(async () => expect((await readCheckpoint(cwd))[0]?.status).toBe("on_hold"));
  const task = (await readCheckpoint(cwd))[0];
  if (!task) throw new Error("Missing task");
  return task;
}
const ask = (): string =>
  stepResult(
    '{"status":"needs_input","question":"Which region?","summary":"Choose a region to continue"}',
  );
const fail = (): string => stepResult('{"status":"failed","summary":"Validation failed"}');

test("waiting for an answer neither consumes nor resets an existing repair budget", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { mode: "sequential", concurrency: 1, maxRepairs: 1 },
  });
  const controller = new AbortController();
  const calls: StepInput[] = [];
  const run = runWorkflow(
    { ...runInput(project.cwd), signal: controller.signal },
    async (input) => {
      calls.push(input);
      if (input.task.id !== "a") return "Done";
      if (!input.feedback || input.inputRequests?.[0]?.answer) return fail();
      return ask();
    },
  );
  const failed = expect(run).rejects.toThrow("1/3 tasks completed");
  try {
    const task = await held(project.cwd);
    expect(task.repairAttempts).toBe(1);
    await answerTaskInput(project.cwd, task, "Brazil");
    await failed;
    expect(calls.filter((input) => input.task.id === "a")).toHaveLength(3);
  } finally {
    controller.abort();
    await run.catch(() => {});
  }
});

test("empty, duplicate and stale answers cannot overwrite the accepted decision", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const controller = new AbortController();
  const run = runWorkflow({ ...runInput(project.cwd), signal: controller.signal }, waitForDecision);
  void run.catch(() => {});
  try {
    const task = await held(project.cwd);
    await expect(answerTaskInput(project.cwd, task, " ")).rejects.toThrow();
    const answers = await Promise.allSettled([
      answerTaskInput(project.cwd, task, "Brazil"),
      answerTaskInput(project.cwd, task, "Portugal"),
    ]);
    expect(answers.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await run;
    const accepted = (await readCheckpoint(project.cwd))[0]?.inputRequests?.[0]?.answer;
    expect(["Brazil", "Portugal"]).toContain(accepted);
    await expect(answerTaskInput(project.cwd, task, "Replace answer")).rejects.toThrow(
      "no longer pending",
    );
    expect((await readCheckpoint(project.cwd))[0]?.inputRequests?.[0]?.answer).toBe(accepted);
  } finally {
    controller.abort();
    await run.catch(() => {});
  }
});

async function waitForDecision(input: StepInput): Promise<string> {
  if (input.task.id === "a" && !input.inputRequests?.[0]?.answer) return ask();
  return "Done";
}
