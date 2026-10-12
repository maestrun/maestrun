import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { UserError } from "../../src/shared/errors.js";
import { RUN_CONFIG, TASKS, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    tasksPath: "tasks.json",
    signal: new AbortController().signal,
    ui: scriptedUi([]).ui,
  };
}

test("a completed run invokes no executors when run again and dry-run shows skips", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async () => "Done");
  const execute = vi.fn(async () => "Unexpected repeat");
  await runWorkflow(input(project.cwd), execute);
  const script = scriptedUi([]);
  await runWorkflow({ ...input(project.cwd), ui: script.ui, dryRun: true }, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(script.messages.filter((line) => line.includes("Done — skipped"))).toHaveLength(3);
});

test.for(["sequential", "parallel"] as const)(
  "%s retries only unfinished steps and unblocks dependencies",
  async (mode, { project }) => {
    await setupRun(project.cwd, { ...RUN_CONFIG, execution: { mode, concurrency: 2 } });
    await expect(
      runWorkflow(input(project.cwd), async ({ task, stage }) => {
        if (task.id === "a" && stage.id === "testing") throw new UserError("Crash", "Retry");
        return "Done";
      }),
    ).rejects.toThrow("1/3 tasks completed");
    const calls: string[] = [];
    await runWorkflow(input(project.cwd), async ({ task, stage, previousResults }) => {
      if (task.id === "a")
        expect(previousResults).toEqual([{ stage: "implementation", summary: "Done" }]);
      calls.push(`${task.id}:${stage.id}`);
      return "Recovered";
    });
    expect(calls).toEqual(["a:testing", "b:implementation", "b:testing"]);
    const report = JSON.parse(
      await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
    ) as RunReport;
    expect(
      report.tasks.every(
        (task) => task.status === "completed" && task.completedSteps === 2 && !task.error,
      ),
    ).toBe(true);
  },
);

test.for(["history", "legacy-counters", "final-step-saved"])(
  "recovers a %s crash checkpoint without replaying saved work",
  async (mode, { project }) => {
    await setupRun(project.cwd);
    await runWorkflow(input(project.cwd), async () => "Done");
    const path = join(project.cwd, ".maestrun/run.json");
    const report = JSON.parse(await readFile(path, "utf8")) as RunReport;
    const task = report.tasks[1];
    if (!task) throw new Error("Missing task");
    task.status = "running";
    task.completedSteps = mode === "final-step-saved" ? 2 : 1;
    delete task.definition;
    if (mode === "legacy-counters") delete task.steps;
    else if (task.steps?.[1] && mode !== "final-step-saved") task.steps[1].status = "running";
    delete report.finishedAt;
    await writeFile(path, JSON.stringify(report));
    const calls: string[] = [];
    await runWorkflow(input(project.cwd), async ({ task, stage }) => {
      calls.push(`${task.id}:${stage.id}`);
      return "Recovered";
    });
    expect(calls).toEqual(mode === "final-step-saved" ? [] : ["b:testing"]);
  },
);

test("completed tasks survive switching manifests and new tasks still run", async ({ project }) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async () => "Done");
  await writeFile(
    join(project.cwd, "other.json"),
    JSON.stringify({
      version: 1,
      tasks: [{ id: "new", title: "New work", instructions: "Do new work", dependsOn: [] }],
    }),
  );
  const calls: string[] = [];
  const execute = async ({ task }: StepInput): Promise<string> => {
    calls.push(task.id);
    return "Done";
  };
  await runWorkflow({ ...input(project.cwd), tasksPath: "other.json" }, execute);
  await runWorkflow(input(project.cwd), execute);
  expect(calls).toEqual(["new", "new"]);
});

test("changed task definitions stop before execution and preserve the checkpoint", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async () => "Done");
  const path = join(project.cwd, ".maestrun/run.json");
  const before = await readFile(path, "utf8");
  await writeFile(
    join(project.cwd, "tasks.json"),
    JSON.stringify({
      version: 1,
      tasks: TASKS.map((task) => ({ ...task, instructions: "Different work" })),
    }),
  );
  const execute = vi.fn(async () => "Unexpected repeat");
  await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow(
    "changed since the saved run",
  );
  expect(execute).not.toHaveBeenCalled();
  expect(await readFile(path, "utf8")).toBe(before);
});

test.for([
  "{broken",
  '{"version":1,"tasks":[{"id":"a","status":"completed","completedSteps":-1}]}',
])("invalid checkpoints never reset progress: %s", async (content, { project }) => {
  await setupRun(project.cwd);
  const path = join(project.cwd, ".maestrun/run.json");
  await writeFile(path, content);
  const execute = vi.fn(async () => "Unexpected repeat");
  await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow(
    "Cannot resume saved progress",
  );
  expect(execute).not.toHaveBeenCalled();
  expect(await readFile(path, "utf8")).toBe(content);
});
