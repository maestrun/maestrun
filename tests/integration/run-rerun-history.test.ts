import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { RunReport } from "../../src/contracts/run.js";
import { runWorkflow, showRun, stepResult, taskBody } from "../../src/modules/execution/index.js";
import { UserError } from "../../src/shared/errors.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { viewState } from "../helpers/run-view.js";
import { scriptedUi } from "../helpers/ui.js";
import { test } from "../helpers/project.js";

function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    tasksPath: "tasks.json",
    signal: new AbortController().signal,
    ui: scriptedUi([]).ui,
  };
}

async function report(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}

test("QA rerun justification is saved before execution and survives success, details and reopening", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: [...RUN_CONFIG.stages, { id: "qa", executor: "codex", model: "qa-model" }],
  });
  await runWorkflow(input(project.cwd), async (step) => {
    if (step.task.id === "a" && step.stage.id === "qa" && !step.feedback)
      return stepResult('{"status":"refactor","summary":"Upper bound is missing in clamp.mjs"}');
    if (step.task.id === "a" && step.stage.id === "implementation" && step.feedback)
      expect((await report(project.cwd)).tasks[0]?.reruns).toEqual([
        {
          startedAt: expect.any(String),
          fromStep: "qa",
          toStep: "implementation",
          justification: step.feedback,
        },
      ]);
    return "Verified";
  });
  const saved = await report(project.cwd);
  expect(saved.tasks[0]?.error).toBeUndefined();
  expect(saved.tasks[0]?.reruns).toHaveLength(1);
  expect(saved.tasks.slice(1).every((task) => !task.reruns)).toBe(true);
  await verifyHistoryAccess(project.cwd, saved);
});

async function verifyHistoryAccess(cwd: string, saved: RunReport): Promise<void> {
  const details = taskBody(
    saved,
    { ...viewState(), details: true },
    { width: 150, height: 50 },
  ).join("\n");
  expect(details).toContain("Rerun 1: QA → Implementation");
  expect(details).toContain("Justification: Automatic repair (1/5) after qa:");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await showRun(cwd);
  expect(log).toHaveBeenCalledWith(expect.stringContaining("Upper bound is missing in clamp.mjs"));
  const execute = vi.fn(async () => "Unexpected execution");
  await runWorkflow(input(cwd), execute);
  expect(execute).not.toHaveBeenCalled();
  expect((await report(cwd)).tasks[0]?.reruns).toEqual(saved.tasks[0]?.reruns);
}

test("resuming failed implementation appends its justification without overwriting earlier reruns", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await expect(
    runWorkflow(input(project.cwd), async ({ task }) => {
      if (task.id === "a")
        return stepResult('{"status":"failed","summary":"Implementation is incomplete"}');
      return "Verified";
    }),
  ).rejects.toThrow();
  const first = (await report(project.cwd)).tasks[0]?.reruns;
  expect(first).toHaveLength(5);
  await runWorkflow(input(project.cwd), async () => "Fixed");
  const reruns = (await report(project.cwd)).tasks[0]?.reruns;
  expect(reruns).toHaveLength(6);
  expect(reruns?.slice(0, 5)).toEqual(first);
  expect(reruns?.[5]).toMatchObject({
    fromStep: "implementation",
    toStep: "implementation",
    justification: expect.stringContaining("Implementation is incomplete"),
  });
});

test("a resumed interrupted implementation records why it is running again", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await expect(
    runWorkflow(input(project.cwd), async () => {
      throw new UserError("Interrupted", "Retry");
    }),
  ).rejects.toThrow();
  const saved = await report(project.cwd);
  const task = saved.tasks[0];
  if (!task) throw new Error("Missing task");
  task.status = "running";
  delete task.error;
  await writeFile(join(project.cwd, ".maestrun/run.json"), JSON.stringify(saved));
  await runWorkflow(input(project.cwd), async () => "Recovered");
  expect((await report(project.cwd)).tasks[0]?.reruns?.[0]?.justification).toBe(
    "Previous Implementation attempt did not complete.",
  );
});

test.for([
  null,
  [{}],
  [{ startedAt: "bad", fromStep: "qa", toStep: "implementation", justification: "Missing scope" }],
])("invalid rerun history is rejected without overwriting it: %j", async (reruns, { project }) => {
  await setupRun(project.cwd);
  await runWorkflow(input(project.cwd), async () => "Done");
  const saved = await report(project.cwd);
  Object.assign(saved.tasks[0] ?? {}, { reruns });
  const content = JSON.stringify(saved);
  const path = join(project.cwd, ".maestrun/run.json");
  await writeFile(path, content);
  await expect(runWorkflow(input(project.cwd), async () => "Unexpected")).rejects.toThrow(
    "invalid rerun history",
  );
  expect(await readFile(path, "utf8")).toBe(content);
});
