import { expect, vi } from "vitest";
import type { StepInput, TaskState } from "../../src/contracts/run.js";
import {
  answerTaskInput,
  readCheckpoint,
  runWorkflow,
  stepResult,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { runInput, savedReport } from "../helpers/worktrees.js";

const question = (): string =>
  stepResult(
    JSON.stringify({
      status: "needs_input",
      question: "Which region?",
      summary: "Implementation is saved; choose a region for testing.",
    }),
  );
async function task(cwd: string, id: string, status: string): Promise<TaskState> {
  const state = (await savedReport(cwd)).tasks.find((entry) => entry.id === id);
  expect(state?.status).toBe(status);
  if (!state) throw new Error("Missing task");
  return state;
}
async function waiting(cwd: string, id: string, status: string): Promise<TaskState> {
  await vi.waitFor(() => task(cwd, id, status), { timeout: 5000 });
  return task(cwd, id, status);
}

test.for(["sequential", "parallel"] as const)(
  "%s holds preserve progress and allow independent tasks to finish",
  async (mode, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode, concurrency: 2, maxRepairs: 0 },
    });
    const controller = new AbortController();
    const calls: StepInput[] = [];
    const run = runWorkflow({ ...runInput(project.cwd), signal: controller.signal }, (input) =>
      executeUntilInput(input, calls),
    );
    void run.catch(() => {});
    try {
      const held = await waiting(project.cwd, "a", "on_hold");
      await waiting(project.cwd, "c", "completed");
      expect(held.completedSteps).toBe(1);
      expect(held.steps?.[1]?.status).toBe("on_hold");
      expect(held.repairAttempts).toBeUndefined();
      expect((await readCheckpoint(project.cwd))[0]?.status).toBe("on_hold");
      await answerTaskInput(project.cwd, held, "Brazil");
      await run;
      await verifyResumed(project.cwd, calls);
    } finally {
      controller.abort();
      await run.catch(() => {});
    }
  },
);

test("multiple pending inputs resume only their answered tasks", async ({ project }) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, execution: { mode: "parallel", concurrency: 2 } });
  const controller = new AbortController();
  const run = runWorkflow(
    { ...runInput(project.cwd), signal: controller.signal },
    async (input) => {
      if (input.task.id !== "b" && !input.inputRequests?.[0]?.answer) return question();
      return "Verified";
    },
  );
  void run.catch(() => {});
  try {
    const first = await waiting(project.cwd, "a", "on_hold");
    const second = await waiting(project.cwd, "c", "on_hold");
    await answerTaskInput(project.cwd, second, "Portugal");
    await waiting(project.cwd, "c", "completed");
    expect((await task(project.cwd, "a", "on_hold")).inputRequests?.[0]?.answer).toBeUndefined();
    await task(project.cwd, "b", "pending");
    await answerTaskInput(project.cwd, first, "Brazil");
    await run;
    expect(
      (await savedReport(project.cwd)).tasks.map((entry) => entry.inputRequests?.[0]?.answer),
    ).toEqual(["Brazil", undefined, "Portugal"]);
  } finally {
    controller.abort();
    await run.catch(() => {});
  }
});

test("cancelling and resuming keeps the same unanswered question without rerunning the model", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const controller = new AbortController();
  const run = pauseRun(project.cwd, controller.signal);
  const cancelled = expect(run).rejects.toThrow("Cancelled");
  const held = await waiting(project.cwd, "a", "on_hold");
  controller.abort();
  await cancelled;
  const resumedController = new AbortController();
  const execute = vi.fn(async (input: StepInput) => `${input.task.id} Verified`);
  const resumed = runWorkflow(
    { ...runInput(project.cwd), signal: resumedController.signal },
    execute,
  );
  void resumed.catch(() => {});
  try {
    const restored = await waiting(project.cwd, "a", "on_hold");
    expect(restored.inputRequests).toEqual(held.inputRequests);
    expect(execute.mock.calls.filter(([input]) => input.task.id === "a")).toHaveLength(0);
    await answerTaskInput(project.cwd, restored, "Brazil");
    await resumed;
  } finally {
    resumedController.abort();
    await resumed.catch(() => {});
  }
});

async function executeUntilInput(input: StepInput, calls: StepInput[]): Promise<string> {
  calls.push({ ...input, inputRequests: structuredClone(input.inputRequests ?? []) });
  if (input.task.id === "a" && input.stage.id === "testing" && !input.inputRequests?.[0]?.answer)
    return question();
  return "Verified";
}

async function verifyResumed(cwd: string, calls: StepInput[]): Promise<void> {
  const attempts = calls.filter((call) => call.task.id === "a");
  expect(attempts.map((call) => call.stage.id)).toEqual(["implementation", "testing", "testing"]);
  expect(attempts[2]?.inputRequests?.[0]?.answer).toBe("Brazil");
  expect(attempts[2]?.cwd).toBe(attempts[0]?.cwd);
  expect((await savedReport(cwd)).tasks.every((entry) => entry.status === "completed")).toBe(true);
}

function pauseRun(cwd: string, signal: AbortSignal): Promise<void> {
  return runWorkflow({ ...runInput(cwd), signal }, async ({ task }) =>
    task.id === "a" ? question() : "Done",
  );
}
