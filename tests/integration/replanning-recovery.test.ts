import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { runWorkflow, buildReport, readCheckpoint } from "../../src/modules/execution/index.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { UserError } from "../../src/shared/errors.js";
import { test } from "../helpers/project.js";
import { RUN_CONFIG, TASKS, setupRun } from "../helpers/run.js";
import {
  REPLAN_CONFIG,
  setupReplan,
  generateReplan,
  planContent,
  runInput,
  savedFiles,
  taskMarkdown,
} from "../helpers/replanning.js";

test("replanning preserves completed prefixes and leaves remaining steps pending", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await writeFile(join(project.cwd, "plan.md"), taskMarkdown());
  await expect(
    runWorkflow(runInput(project.cwd), async ({ stage }) => {
      if (stage.id === "testing") throw new UserError("Executor failed", "Retry");
      return "Implemented";
    }),
  ).rejects.toThrow();
  await writeFile(join(project.cwd, ".maestrun/config.json"), JSON.stringify(REPLAN_CONFIG));
  await generateReplan(project.cwd);
  const calls: string[] = [];
  await runWorkflow(runInput(project.cwd), async ({ task, stage }) => {
    calls.push(`${task.id}:${stage.id}`);
    return "Done";
  });
  expect(calls).not.toContain("a:implementation");
  expect(calls).not.toContain("c:implementation");
  expect(calls).toContain("a:review");
  expect(calls).toContain("b:implementation");
});

test("unfinished tasks cannot reorder completed stages or bypass worktree integration", () => {
  const report = buildReport(RUN_CONFIG, TASKS, { previous: [] });
  const task = report.tasks[0];
  if (!task?.steps?.[0]) throw new Error("Missing task");
  task.completedSteps = 1;
  task.steps[0].status = "completed";
  const reordered = {
    ...RUN_CONFIG,
    stages: [RUN_CONFIG.stages[0], RUN_CONFIG.stages[2], RUN_CONFIG.stages[1]].filter(
      (stage) => stage !== undefined,
    ),
  };
  expect(() => buildReport(reordered, TASKS, { previous: report.tasks, replan: true })).toThrow(
    "completed stage order changed",
  );
  task.completedSteps = 2;
  task.steps.forEach((step) => {
    step.status = "completed";
  });
  task.worktree = { id: "retained", base: "base" };
  const replanned = buildReport(REPLAN_CONFIG, TASKS, { previous: report.tasks, replan: true });
  expect(replanned.tasks[0]).toMatchObject({ status: "pending", completedSteps: 2, totalSteps: 3 });
  expect(replanned.tasks[0]?.plannedStages).toBeUndefined();
});

test("cancellation preserves saved files after successful generation", async ({ project }) => {
  await setupReplan(project.cwd);
  const before = await savedFiles(project.cwd);
  const controller = new AbortController();
  await expect(
    createPlan(
      { ...runInput(project.cwd), signal: controller.signal },
      {
        wizard: async () => ({
          config: REPLAN_CONFIG,
          requirements: { text: "Update", source: "Pasted text" },
        }),
        detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }),
        generate: async () => {
          controller.abort();
          return planContent("simple");
        },
      },
    ),
  ).rejects.toThrow("Cancelled");
  expect(await savedFiles(project.cwd)).toEqual(before);
  await generateReplan(project.cwd);
});

test("a concurrent plan edit rolls back progress without overwriting the user's edit", async ({
  project,
}) => {
  await setupReplan(project.cwd);
  const before = await savedFiles(project.cwd);
  await expect(
    generateReplan(project.cwd, "simple", async () => {
      await writeFile(join(project.cwd, "plan.md"), "User edit");
      return planContent("simple");
    }),
  ).rejects.toThrow("changed during the command");
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("User edit");
  expect(await readFile(join(project.cwd, ".maestrun/run.json"), "utf8")).toBe(before[1]);
});

test("an active run blocks replanning before any model call", async ({ project }) => {
  await setupReplan(project.cwd);
  const before = await savedFiles(project.cwd);
  await mkdir(join(project.cwd, ".maestrun/run.lock"));
  const generate = vi.fn(async () => planContent("simple"));
  await expect(generateReplan(project.cwd, "simple", generate)).rejects.toThrow("run lock");
  expect(generate).not.toHaveBeenCalled();
  expect(await savedFiles(project.cwd)).toEqual(before);
});

test.for([[], ["testing", "testing"], [123], "testing"])(
  "rejects invalid replanning metadata %j",
  async (plannedStages, { project }) => {
    await setupReplan(project.cwd);
    const path = join(project.cwd, ".maestrun/run.json");
    const report = buildReport(RUN_CONFIG, TASKS, { previous: await readCheckpoint(project.cwd) });
    await writeFile(
      path,
      JSON.stringify({
        ...report,
        tasks: report.tasks.map((task) => ({ ...task, plannedStages })),
      }),
    );
    await expect(generateReplan(project.cwd)).rejects.toThrow("invalid replanned stages");
  },
);
