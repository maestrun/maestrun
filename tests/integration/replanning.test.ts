import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { RunReport } from "../../src/contracts/run.js";
import { runWorkflow, loadTasks } from "../../src/modules/execution/index.js";
import { planningPrompt, runPlanWizard } from "../../src/modules/planning/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { test } from "../helpers/project.js";
import { TASKS } from "../helpers/run.js";
import { wizardContext } from "../helpers/context.js";
import { scriptedUi } from "../helpers/ui.js";
import {
  setupReplan,
  generateReplan,
  planContent,
  runInput,
  savedFiles,
  REPLAN_CONFIG,
} from "../helpers/replanning.js";

test.for(["simple", "advanced"] as const)(
  "%s replan preserves completed tasks and executes only new work",
  async (mode, { project }) => {
    await setupReplan(project.cwd);
    await expect(runWorkflow({ ...runInput(project.cwd), dryRun: true })).rejects.toThrow(
      "workflow stages changed",
    );
    const tasks = [
      ...TASKS,
      { id: "new", title: "New", instructions: "Additional work", dependsOn: ["a"] },
    ];
    await generateReplan(project.cwd, mode, async ({ draft }) => {
      expect(planningPrompt(draft)).toContain("Completed tasks remain completed");
      expect(draft.previousPlan).toContain('"instructions":"Implement A"');
      return planContent(mode, tasks);
    });
    await expectOriginalHistory(project.cwd);
    const execute = vi.fn(async () => "New work done");
    const script = scriptedUi([]);
    await runWorkflow({ ...runInput(project.cwd), ui: script.ui, dryRun: true }, execute);
    expect(script.messages.filter((line) => line.includes("Done — skipped"))).toHaveLength(3);
    await runWorkflow(runInput(project.cwd), execute);
    expect(execute.mock.calls).toHaveLength(3);
    expect(await loadTasks(project.cwd, "plan.md")).toEqual(tasks);
  },
);

test("advanced to simple replan reads linked tasks and preserves archived progress", async ({
  project,
}) => {
  await setupReplan(project.cwd);
  await generateReplan(project.cwd, "advanced");
  await generateReplan(project.cwd, "simple", async ({ draft }) => {
    expect(draft.previousPlan).toContain('"instructions":"Implement A"');
    return planContent("simple", TASKS.slice(0, 1));
  });
  const report = JSON.parse(
    await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
  ) as RunReport;
  expect(report.archivedTasks?.map((task) => task.id)).toEqual(["b", "c"]);
  await generateReplan(project.cwd);
  const execute = vi.fn(async () => "Unexpected repeat");
  await runWorkflow(runInput(project.cwd), execute);
  expect(execute).not.toHaveBeenCalled();
});

test.for(["simple", "advanced"] as const)(
  "%s rejects changed definitions before replacing files",
  async (mode, { project }) => {
    await setupReplan(project.cwd);
    const before = await savedFiles(project.cwd);
    await expect(
      generateReplan(project.cwd, mode, async () =>
        planContent(
          mode,
          TASKS.map((task) => ({ ...task, instructions: "Different work" })),
        ),
      ),
    ).rejects.toThrow("changed since the saved run");
    expect(await savedFiles(project.cwd)).toEqual(before);
    expect((await snapshotFile(join(project.cwd, "replanned/tasks.md"))).exists).toBe(false);
  },
);

test.for(["failure", "cancel", "invalid"])(
  "%s preserves plan and progress and releases the lock",
  async (mode, { project }) => {
    await setupReplan(project.cwd);
    const before = await savedFiles(project.cwd);
    await expect(
      generateReplan(project.cwd, "simple", async () => {
        if (mode === "invalid") return "Not a task plan";
        throw new Error(mode);
      }),
    ).rejects.toThrow();
    expect(await savedFiles(project.cwd)).toEqual(before);
    await generateReplan(project.cwd);
  },
);

test.for(["simple", "advanced"] as const)(
  "offers %s when replanning a project with saved progress",
  async (mode, { project }) => {
    await setupReplan(project.cwd);
    const answers = [
      "paste",
      "Update steps",
      mode,
      ...(mode === "advanced" ? ["replanned"] : []),
      true,
      true,
    ];
    const script = scriptedUi(answers);
    const draft = await runPlanWizard({
      ...wizardContext(project.cwd, script.ui),
      config: REPLAN_CONFIG,
      planExists: true,
    });
    expect(draft.planMode).toBe(mode);
    expect(script.remaining()).toBe(0);
  },
);

test("changing steps again requires another validated plan", async ({ project }) => {
  await setupReplan(project.cwd);
  await generateReplan(project.cwd);
  const path = join(project.cwd, ".maestrun/config.json");
  await writeFile(
    path,
    JSON.stringify({ ...REPLAN_CONFIG, stages: REPLAN_CONFIG.stages.slice(0, 2) }),
  );
  const execute = vi.fn(async () => "Unexpected repeat");
  await expect(runWorkflow(runInput(project.cwd), execute)).rejects.toThrow(
    "workflow stages changed",
  );
  expect(execute).not.toHaveBeenCalled();
});

async function expectOriginalHistory(cwd: string): Promise<void> {
  const report = JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
  expect(report.tasks[0]).toMatchObject({
    status: "completed",
    completedSteps: 2,
    totalSteps: 2,
  });
  expect(report.tasks[0]?.steps?.map((step) => step.id)).toEqual(["implementation", "testing"]);
}
