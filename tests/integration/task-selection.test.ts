import { expect, vi } from "vitest";
import {
  buildReport,
  chooseRunTasks,
  runWorkflow,
  schedule,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { RUN_CONFIG, setupRun, TASKS } from "../helpers/run.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { scriptedUi } from "../helpers/ui.js";

test.for([undefined, "plan", "agent"] as const)(
  "selected tasks leave the rest pending with %s orchestration",
  async (orchestrator, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 1, ...(orchestrator ? { orchestrator } : {}) },
    });
    const execute = vi.fn(async () => "Verified");
    await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, execute);
    expect(execute).toHaveBeenCalledTimes(2);
    const report = await savedReport(project.cwd);
    expect(report.tasks.find((task) => task.id === "a")?.status).toBe("completed");
    expect(report.tasks.find((task) => task.id === "b")?.status).toBe("pending");
    await runWorkflow({ ...runInput(project.cwd), only: ["b"] }, execute);
    expect(execute).toHaveBeenCalledTimes(4);
  },
);

test("selection rejects unknown IDs and unfinished excluded dependencies before execution", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const execute = vi.fn();
  for (const selection of [{ only: ["b"] }, { skip: ["a"] }, { only: ["missing"] }, { only: [] }])
    await expect(
      runWorkflow({ ...runInput(project.cwd), ...selection }, execute),
    ).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

test("interactive run defaults to All and completed tasks are disabled on the next selection", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const all = scriptedUi(["all"]);
  expect(await chooseRunTasks({ ...runInput(project.cwd), ui: all.ui })).toBeUndefined();
  expect(all.calls[0]?.initial).toBe("all");
  await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async () => "Verified");
  const selected = scriptedUi(["choose", ["c"]]);
  expect(await chooseRunTasks({ ...runInput(project.cwd), ui: selected.ui })).toEqual(["c"]);
  expect(selected.calls[1]?.choices?.find((choice) => choice.value === "a")?.disabled).toBe(
    "completed",
  );
  expect(selected.calls[1]?.initial).toEqual(["b", "c"]);
  await runWorkflow(runInput(project.cwd), async () => "Verified");
  expect((await savedReport(project.cwd)).tasks.every((task) => task.status === "completed")).toBe(
    true,
  );
});

test("unselected tasks awaiting input do not keep a blocked selected run alive", async ({
  project,
}) => {
  const report = buildReport(RUN_CONFIG, TASKS, { previous: [] });
  const dependency = report.tasks.find((task) => task.id === "a");
  const held = report.tasks.find((task) => task.id === "c");
  if (!dependency || !held) throw new Error("Missing tasks");
  dependency.status = "failed";
  held.status = "on_hold";
  await schedule(
    {
      ...runInput(project.cwd),
      config: RUN_CONFIG,
      report,
      selectedTaskIds: ["b"],
      signal: AbortSignal.timeout(1000),
      execute: vi.fn(),
      update: async () => {},
    },
    TASKS,
  );
  expect(report.tasks.find((task) => task.id === "b")?.status).toBe("blocked");
  expect(held.status).toBe("on_hold");
});
