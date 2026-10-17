import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { RunReport } from "../../src/contracts/run.js";
import type { Task } from "../../src/contracts/tasks.js";
import { runWorkflow, ORCHESTRATOR_ID } from "../../src/modules/execution/index.js";
import { orchestrationReport } from "../../src/modules/execution/orchestration-state.js";
import { treeTasks, taskTree } from "../../src/modules/execution/task-tree.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const task = (id: string, dependsOn: string[] = []): Task => ({
  id,
  title: id,
  instructions: `Implement ${id}`,
  dependsOn,
  steps: ["implementation"],
});
const tasks = [
  task("verify", ["api", "ui"]),
  task("ui", ["schema"]),
  task("api", ["schema"]),
  task("schema"),
  task("independent"),
];
const hierarchy = {
  __orchestrator__: undefined,
  schema: ORCHESTRATOR_ID,
  ui: "schema",
  api: "schema",
  verify: "api",
  independent: ORCHESTRATOR_ID,
};
const parents = (report: RunReport): Record<string, string | undefined> =>
  Object.fromEntries(report.tasks.map((task) => [task.id, task.parentId]));

test.for(["plan", "agent"] as const)(
  "%s orchestration derives dependency levels in previews, decisions and resumed flat reports",
  async (strategy, { project }) => {
    const config = {
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 1, orchestrator: strategy } as const,
    };
    await setupRun(project.cwd, config);
    await writeFile(join(project.cwd, "tasks.json"), JSON.stringify({ version: 1, tasks }));
    const preview = await orchestrationReport(project.cwd, config, tasks);
    expect(parents(preview)).toEqual(hierarchy);
    const input = {
      cwd: project.cwd,
      tasksPath: "tasks.json",
      ui: scriptedUi([]).ui,
      signal: new AbortController().signal,
    };
    const calls: string[] = [];
    await runWorkflow(input, async ({ task, stage }) => {
      if (task.id === ORCHESTRATOR_ID)
        return JSON.stringify(
          stage.id === "custom:Coordinate 1" ? { done: false, tasks } : { done: true },
        );
      calls.push(task.id);
      return "Done";
    });
    expect(calls).toEqual(["schema", "ui", "api", "verify", "independent"]);
    const path = join(project.cwd, ".maestrun/run.json");
    const saved = JSON.parse(await readFile(path, "utf8")) as RunReport;
    checkHierarchy(saved);
    await checkFlatResume({ input, saved, path });
  },
);

function checkHierarchy(saved: RunReport): void {
  expect(parents(saved)).toEqual(hierarchy);
  expect(saved.orchestration?.tasks).toEqual(tasks);
  expect(
    taskTree(treeTasks(saved, saved.tasks), {
      selected: "schema",
      scroll: 0,
      width: 120,
      height: 30,
    }).join("\n"),
  ).toContain("│     └─ verify");
}

async function checkFlatResume({
  input,
  saved,
  path,
}: {
  input: Parameters<typeof runWorkflow>[0];
  saved: RunReport;
  path: string;
}): Promise<void> {
  for (const state of saved.tasks.slice(1)) state.parentId = ORCHESTRATOR_ID;
  await writeFile(path, JSON.stringify(saved));
  const execute = vi.fn();
  await runWorkflow(input, execute);
  expect(execute).not.toHaveBeenCalled();
  const resumed = JSON.parse(await readFile(path, "utf8")) as RunReport;
  expect(parents(resumed)).toEqual(hierarchy);
  expect(resumed.tasks.every((state) => state.status === "completed")).toBe(true);
}

test("hierarchy includes repairs, preserves explicit parents and avoids mixed parent cycles", async ({
  project,
}) => {
  const config = {
    ...RUN_CONFIG,
    execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" } as const,
  };
  const tasks = [
    task("build"),
    task("review", ["build"]),
    { ...task("fix", ["build"]), repairFor: "review" },
    { ...task("grouped", ["review"]), parentId: "build" },
    { ...task("child"), parentId: "parent" },
    task("parent", ["child"]),
  ];
  const report = await orchestrationReport(project.cwd, config, tasks);
  expect(parents(report)).toEqual({
    __orchestrator__: undefined,
    build: ORCHESTRATOR_ID,
    fix: "build",
    review: "fix",
    grouped: "build",
    child: "parent",
    parent: ORCHESTRATOR_ID,
  });
  expect(treeTasks(report, report.tasks)).toHaveLength(report.tasks.length);
});
