import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { Task } from "../../src/contracts/tasks.js";
import type { StepInput, RunReport } from "../../src/contracts/run.js";
import { ORCHESTRATOR_ID, runWorkflow } from "../../src/modules/execution/index.js";
import { RefactorError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const TASKS: readonly Task[] = [
  {
    id: "frontend",
    title: "Frontend",
    dependsOn: [],
    steps: ["implementation"],
    instructions: "Implement frontend.",
  },
  {
    id: "accept",
    title: "Final acceptance",
    dependsOn: ["frontend"],
    steps: ["qa"],
    instructions: "Review only.",
  },
];
const REPAIR: Task = {
  id: "repair",
  title: "Repair frontend",
  dependsOn: ["frontend"],
  repairFor: "accept",
  steps: ["implementation", "testing"],
  instructions: "Fix the malformed error and independently inspect 768 px.",
};
const input = (cwd: string) => ({
  cwd,
  ui: scriptedUi([]).ui,
  signal: new AbortController().signal,
  tasksPath: "tasks.json",
});

async function setup(cwd: string, mode: "sequential" | "parallel", maxRepairs = 1) {
  await setupRun(cwd, {
    ...RUN_CONFIG,
    execution: { mode, concurrency: 2, orchestrator: "agent", maxRepairs },
  });
  await writeFile(join(cwd, "tasks.json"), JSON.stringify({ version: 1, tasks: TASKS }));
}

function worker(calls: string[]) {
  let reviewed = false;
  return async ({ cwd, task, stage }: StepInput) => {
    calls.push(`${task.id}:${stage.id}`);
    if (task.id === ORCHESTRATOR_ID)
      return JSON.stringify(
        stage.id === "custom:Coordinate 3"
          ? { done: true }
          : { done: false, tasks: stage.id === "custom:Coordinate 1" ? TASKS : [...TASKS, REPAIR] },
      );
    if (task.id === "frontend") await writeFile(join(cwd, "api.js"), "original");
    if (task.id === "repair") await writeFile(join(cwd, "api.js"), "fixed and visually inspected");
    if (task.id === "accept" && !reviewed) {
      reviewed = true;
      await writeFile(join(cwd, "review-notes.txt"), "Preserved evidence");
      throw new RefactorError(
        "Validate error.code as a string and inspect 768 px",
        "Frontend and FrontendTests must repair.",
      );
    }
    if (task.id === "accept") {
      expect(await readFile(join(cwd, "api.js"), "utf8")).toBe("fixed and visually inspected");
      expect(await readFile(join(cwd, "review-notes.txt"), "utf8")).toBe("Preserved evidence");
    }
    return "Verified";
  };
}

test.for(["sequential", "parallel"] as const)(
  "%s routes QA to specialists before retrying and preserves work",
  async (mode, { project }) => {
    await setup(project.cwd, mode);
    const calls: string[] = [];
    await runWorkflow(input(project.cwd), worker(calls));
    expect(calls).toEqual([
      "__orchestrator__:custom:Coordinate 1",
      "frontend:implementation",
      "accept:qa",
      "__orchestrator__:custom:Coordinate 2",
      "repair:implementation",
      "repair:testing",
      "accept:qa",
      "__orchestrator__:custom:Coordinate 3",
    ]);
    const saved: RunReport = JSON.parse(
      await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
    );
    expect(saved.tasks.every((task) => task.status === "completed")).toBe(true);
    expect(saved.orchestration?.repairRounds).toBe(1);
  },
);

test("zero disables coordinated repairs without repeating a QA-only task", async ({ project }) => {
  await setup(project.cwd, "sequential", 0);
  const calls: string[] = [];
  await expect(runWorkflow(input(project.cwd), worker(calls))).rejects.toThrow("tasks completed");
  expect(calls).toEqual([
    "__orchestrator__:custom:Coordinate 1",
    "frontend:implementation",
    "accept:qa",
  ]);
});

test("coordinator cannot repeat a failed review without new repair tasks", async ({ project }) => {
  await setup(project.cwd, "sequential");
  const execute = worker([]);
  await expect(
    runWorkflow(input(project.cwd), async (step) =>
      step.stage.id === "custom:Coordinate 2"
        ? JSON.stringify({ done: false, tasks: TASKS })
        : execute(step),
    ),
  ).rejects.toThrow("needs a new specialist repair task");
});
