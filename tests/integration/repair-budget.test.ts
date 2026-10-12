import { expect } from "vitest";
import { configure, loadConfig, parseConfig } from "../../src/config/index.js";
import { runWorkflow, stepResult } from "../../src/modules/execution/index.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { test } from "../helpers/project.js";

test("defaults to five repair cycles and succeeds after more than one correction", async ({
  project,
}) => {
  await setupRun(project.cwd);
  let failures = 0;
  const feedback: string[] = [];
  await runWorkflow(runInput(project.cwd), async (step) => {
    if (step.task.id !== "a") return "Done";
    if (step.stage.id === "testing" && failures++ < 4)
      return stepResult('{"status":"refactor","summary":"Fix remaining issue"}');
    if (step.stage.id === "implementation" && step.feedback) feedback.push(step.feedback);
    return "Fixed";
  });
  expect(feedback).toHaveLength(4);
  expect(feedback[3]).toContain("Automatic repair (4/5)");
  expect((await savedReport(project.cwd)).tasks[0]?.reruns).toHaveLength(4);
});

test("exhausts exactly five repairs, preserves evidence and blocks dependants", async ({
  project,
}) => {
  await setupRun(project.cwd);
  let attempts = 0;
  await expect(
    runWorkflow(runInput(project.cwd), async ({ task, stage }) => {
      if (task.id === "a" && stage.id === "implementation") attempts++;
      if (task.id === "a" && stage.id === "testing")
        return stepResult('{"status":"failed","summary":"Still broken"}');
      return "Verified";
    }),
  ).rejects.toThrow("1/3 tasks completed");
  expect(attempts).toBe(6);
  const report = await savedReport(project.cwd);
  expect(report.tasks[0]?.reruns).toHaveLength(5);
  expect(report.tasks[1]?.status).toBe("blocked");
  expect(report.tasks[2]?.status).toBe("completed");
});

test("zero disables automatic repair and global/project limits remain configurable", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await configure(project.cwd, ["global", "execution.maxRepairs", "8"]);
  expect((await loadConfig(project.cwd)).config?.execution?.maxRepairs).toBe(8);
  await configure(project.cwd, ["execution.maxRepairs", "0"]);
  let calls = 0;
  await expect(
    runWorkflow(runInput(project.cwd), async ({ task }) => {
      if (task.id === "a") {
        calls++;
        return stepResult('{"status":"failed","summary":"No retry"}');
      }
      return "Done";
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test.for([-1, 101, 1.5, "5", null])("rejects invalid repair budget %j", (maxRepairs) => {
  expect(() =>
    parseConfig({ ...RUN_CONFIG, execution: { mode: "sequential", maxRepairs } }),
  ).toThrow("maxRepairs");
});
