import { expect, vi } from "vitest";
import { answerTaskInput, readCheckpoint, runWorkflow } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { runInput } from "../helpers/worktrees.js";
import { executionProcesses } from "../helpers/execution-processes.js";

test("executor login failures hold tasks until the user authenticates and confirms", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { mode: "sequential", concurrency: 1, maxRepairs: 0 },
  });
  await executionProcesses(project, "login");
  const controller = new AbortController();
  const run = runWorkflow({ ...runInput(project.cwd), signal: controller.signal });
  void run.catch(() => {});
  try {
    await vi.waitFor(async () =>
      expect((await readCheckpoint(project.cwd))[0]?.status).toBe("on_hold"),
    );
    const task = (await readCheckpoint(project.cwd))[0];
    if (!task) throw new Error("Missing task");
    expect(task.inputRequests?.[0]?.summary).toContain("requires authentication");
    expect(task.inputRequests?.[0]?.question).toContain("codex login");
    expect(task.repairAttempts).toBeUndefined();
    vi.stubEnv("ORK_RUN_MODE", "success");
    await answerTaskInput(project.cwd, task, "Login complete");
    await vi.waitFor(async () =>
      expect((await readCheckpoint(project.cwd))[0]?.status).toBe("completed"),
    );
  } finally {
    controller.abort();
    await run.catch(() => {});
  }
});
