import { expect, vi } from "vitest";
import { runWithRecovery } from "../../src/modules/onboarding/index.js";
import { runWorkflow, failureSummary } from "../../src/modules/execution/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { CancelError, UserError } from "../../src/shared/errors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
import { setupRun } from "../helpers/run.js";

function context(cwd: string, responses: Parameters<typeof scriptedUi>[0]) {
  const script = scriptedUi(responses);
  return {
    cwd,
    ui: script.ui,
    signal: new AbortController().signal,
    script,
    tasksPath: "tasks.json",
    trustPlugins: false,
  };
}

test("recovery offers evidence, configuration and validated resume preserving run options", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const input = context(project.cwd, ["evidence", "configure", "resume"]);
  const run = vi
    .fn()
    .mockRejectedValueOnce(new UserError("Failed task a", "Fix and resume"))
    .mockResolvedValue(true);
  const configure = vi.fn<typeof initialize>().mockResolvedValue();
  const validate = vi.fn(runWorkflow);
  await runWithRecovery(input, { run, configure, validate }, true);
  expect(run).toHaveBeenCalledTimes(2);
  expect(configure).toHaveBeenCalledOnce();
  expect(validate).toHaveBeenCalledWith(
    expect.objectContaining({ dryRun: true, tasksPath: "tasks.json", trustPlugins: false }),
  );
  expect(input.script.messages.join("\n")).toContain("No task report yet");
});

test("noninteractive failures and cancellation do not prompt or retry", async ({ project }) => {
  const input = context(project.cwd, []);
  const error = new UserError("Failed", "Resume with maestrun run");
  const run = vi.fn().mockRejectedValue(error);
  await expect(
    runWithRecovery(input, { run, configure: initialize, validate: runWorkflow }, false),
  ).rejects.toBe(error);
  run.mockRejectedValue(new CancelError());
  await expect(
    runWithRecovery(input, { run, configure: initialize, validate: runWorkflow }, true),
  ).rejects.toThrow("Cancelled");
  expect(input.script.calls).toHaveLength(0);
});

test("failure summary identifies failed and blocked tasks", () => {
  const report = {
    version: 1 as const,
    startedAt: "now",
    tasks: [
      {
        id: "a",
        title: "A",
        status: "failed" as const,
        step: "testing" as const,
        error: "Tests failed",
        completedSteps: 1,
        totalSteps: 2,
      },
      { id: "b", title: "B", status: "blocked" as const, completedSteps: 0, totalSteps: 2 },
    ],
  };
  expect(failureSummary(report)).toContain("Failed a (A), step testing: Tests failed");
  expect(failureSummary(report)).toContain("Blocked: b (B)");
});
