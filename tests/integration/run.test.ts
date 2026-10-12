import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { UserError, CancelError } from "../../src/shared/errors.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    ui: scriptedUi([]).ui,
    signal: new AbortController().signal,
    tasksPath: "tasks.json",
  };
}

test("runs sequential stages and tasks with model/progress feedback and a final report", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const calls: string[] = [];
  const ui = scriptedUi([]);
  await runWorkflow({ ...input(project.cwd), ui: ui.ui }, async ({ task, stage }) => {
    calls.push(`${task.id}:${stage.id}:${stage.model}`);
    return "Verified";
  });
  expect(calls).toEqual(
    ["a", "b", "c"].flatMap((id) => [`${id}:implementation:code-test`, `${id}:testing:qa-test`]),
  );
  const report: unknown = JSON.parse(
    await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
  );
  expect(report).toMatchObject({
    finishedAt: expect.any(String),
    tasks: [
      { id: "a", status: "completed", completedSteps: 2 },
      { id: "b", status: "completed" },
      { id: "c", status: "completed" },
    ],
  });
  expect(ui.messages.join("\n")).toContain("Progress: 6/6 steps (100%)");
  await expectUnlocked(project.cwd);
});

test("parallel execution is bounded and dependencies wait for every prerequisite stage", async ({
  project,
}) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, execution: { mode: "parallel", concurrency: 2 } });
  const started: string[] = [];
  let active = 0;
  let peak = 0;
  let release: () => void = () => {};
  const both = new Promise<void>((resolve) => {
    release = resolve;
  });
  await runWorkflow(input(project.cwd), async ({ task, stage }) => {
    active += 1;
    peak = Math.max(peak, active);
    started.push(`${task.id}:${stage.id}`);
    if (active === 2) release();
    if (task.id !== "b") await both;
    active -= 1;
    return "Verified";
  });
  expect(peak).toBe(2);
  expect(started.indexOf("b:implementation")).toBeGreaterThan(started.indexOf("a:testing"));
});

test("failures block dependants, preserve independent work and show actionable errors", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const calls: string[] = [];
  await expect(
    runWorkflow(input(project.cwd), async ({ task }) => {
      calls.push(task.id);
      if (task.id === "a") throw new UserError("Tests failed.", "Fix the regression");
      return "Verified";
    }),
  ).rejects.toThrow("1/3 tasks completed");
  expect(calls).toEqual(["a", "c", "c"]);
  const report = await readFile(join(project.cwd, ".maestrun/run.json"), "utf8");
  expect(report).toContain('"status": "failed"');
  expect(report).toContain('"status": "blocked"');
  expect(report).toContain("Tests failed. Next: Fix the regression");
});

test("cancellation persists cancelled tasks and releases the lock", async ({ project }) => {
  await setupRun(project.cwd);
  const controller = new AbortController();
  await expect(
    runWorkflow({ ...input(project.cwd), signal: controller.signal }, async () => {
      controller.abort();
      throw new CancelError();
    }),
  ).rejects.toThrow(CancelError);
  const report = await readFile(join(project.cwd, ".maestrun/run.json"), "utf8");
  expect(report).toContain('"status": "cancelled"');
  await expectUnlocked(project.cwd);
});

test("dry-run validates and previews without loading extensions or starting an executor", async ({
  project,
}) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, plugins: ["./missing.mjs"] });
  const execute = vi.fn();
  const ui = scriptedUi([]);
  await runWorkflow({ ...input(project.cwd), ui: ui.ui, dryRun: true }, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(ui.messages.join("\n")).toContain("implementation: codex/code-test");
  expect((await snapshotFile(join(project.cwd, ".maestrun/run.json"))).exists).toBe(false);
});

async function expectUnlocked(cwd: string): Promise<void> {
  expect((await snapshotFile(join(cwd, ".maestrun/run.lock"))).exists).toBe(false);
}

test("custom stage extensions run through the CLI scheduler and identify the actual provider", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    plugins: ["./audit.mjs"],
    stages: [
      { id: "planning", executor: "codex", model: "test" },
      { id: "custom:Audit", executor: "codex", model: "fallback" },
    ],
  });
  await writeFile(
    join(project.cwd, "audit.mjs"),
    'export default { apiVersion: 1, name: "audit", stages: { "custom:Audit": ({task}) => `Audited ${task.id}` } };',
  );
  const fallback = vi.fn(async () => "Should not run");
  await runWorkflow({ ...input(project.cwd), trustPlugins: true }, fallback);
  expect(fallback).not.toHaveBeenCalled();
  const report = await readFile(join(project.cwd, ".maestrun/run.json"), "utf8");
  expect(report).toContain('"executor": "plugin:audit"');
  expect(report).toContain('"model": "n/a"');
  expect(report).toContain("Audited c");
});
