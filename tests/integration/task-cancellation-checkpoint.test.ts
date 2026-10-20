import { expect } from "vitest";
import { buildReport, runTask } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { RUN_CONFIG, TASKS } from "../helpers/run.js";
import { runInput } from "../helpers/worktrees.js";

test("cancellation between stages preserves completed step history", async ({ project }) => {
  const report = buildReport(RUN_CONFIG, TASKS, { previous: [] });
  const task = TASKS[0];
  if (!task) throw new Error("Missing task");
  const controller = new AbortController();
  await runTask(
    {
      ...runInput(project.cwd),
      config: RUN_CONFIG,
      report,
      signal: controller.signal,
      execute: async () => "Verified",
      update: async (state) => {
        if (state.completedSteps === 1) controller.abort();
      },
    },
    task,
  );
  expect(report.tasks[0]?.status).toBe("cancelled");
  expect(report.tasks[0]?.completedSteps).toBe(1);
  expect(report.tasks[0]?.steps?.map((step) => step.status)).toEqual(["completed", "pending"]);
});
