import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { input } from "@inquirer/prompts";
import { assert, expect, vi } from "vitest";
import { test } from "../../../tests/helpers/project.js";
import { viewReport, viewState } from "../../../tests/helpers/run-view.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";
import { StepInputRequired } from "../../shared/errors.js";
import { holdTask } from "./task-input.js";
import { taskInstructions } from "./task-instructions.js";
import { reflectTaskAnswers } from "./task-input.repository.js";
import { conversationPath } from "./task-conversation.repository.js";
import { FILTERS, visibleTasks } from "./run-view-state.js";
import type { RunReport } from "../../contracts/run.js";
import type { SessionView } from "./execution.types.js";

vi.mock("@inquirer/prompts", () => ({ input: vi.fn() }));

async function heldView(cwd: string, count: number): Promise<SessionView & { report: RunReport }> {
  const report = viewReport();
  for (const task of report.tasks.slice(0, count)) {
    task.steps = [{ id: "implementation", title: "Implementation", status: "running" }];
    task.step = "implementation";
    holdTask(task, new StepInputRequired(`Choose layout for ${task.id}`, "Awaiting a decision"));
  }
  await mkdir(join(cwd, ".maestrun"), { recursive: true });
  await writeFile(join(cwd, ".maestrun/run.json"), JSON.stringify(report));
  return {
    cwd,
    report,
    ui: scriptedUi([]).ui,
    detached: false,
    closed: false,
    lines: new Map(),
    session: { id: "test", pid: process.pid, status: "running", startedAt: report.startedAt },
    selection: { ...viewState(), filter: FILTERS.indexOf("Input") },
  };
}

test.for([
  { count: 1, filter: "All" },
  { count: 2, filter: "All" },
  { count: 1, filter: "Input" },
  { count: 2, filter: "Input" },
] as const)(
  "answering removes the box with $count held tasks in $filter",
  async ({ count, filter }, { project }) => {
    const state = await heldView(project.cwd, count);
    assert(state.selection);
    state.selection.filter = FILTERS.indexOf(filter);
    const task = state.report.tasks[0];
    assert(task);
    const stale = structuredClone(state.report);
    vi.mocked(input).mockResolvedValueOnce("Compact");
    taskInstructions(state, task);
    await state.choosing;
    expect(task.status).toBe("pending");
    expect(task.steps?.[0]?.status).toBe("pending");
    expect(state.selection?.filter).toBe(FILTERS.indexOf(count === 1 ? "All" : filter));
    expect(state.selection?.selected).toBe(count === 1 ? "a" : "b");
    expect(visibleTasks(state.report, FILTERS.indexOf("Input")).map((entry) => entry.id)).toEqual(
      count === 1 ? [] : ["b"],
    );
    expect(vi.mocked(input).mock.calls.at(-1)?.[1]).toMatchObject({ clearPromptOnDone: true });
    // Reconnecting before the worker consumes the answer must not restore the box.
    await reflectTaskAnswers(project.cwd, stale);
    expect(stale.tasks[0]?.status).toBe("pending");
    expect(stale.tasks[0]?.inputRequests?.[0]?.answer).toBe("Compact");
  },
);

test("refreshing a stale report after worker consumption keeps the answered box hidden", async ({
  project,
}) => {
  const state = await heldView(project.cwd, 1);
  const stale = structuredClone(state.report);
  vi.mocked(input).mockResolvedValueOnce("Compact");
  const task = state.report.tasks[0];
  assert(task);
  taskInstructions(state, task);
  await state.choosing;
  const id = task.inputRequests?.[0]?.id;
  assert(id);
  await rm(`${conversationPath(project.cwd, id)}.answer.json`);
  await reflectTaskAnswers(project.cwd, stale, state.report);
  expect(stale.tasks[0]?.status).toBe("pending");
  const restored = stale.tasks[0];
  assert(restored);
  holdTask(restored, new StepInputRequired("Choose color", "Next decision"));
  await reflectTaskAnswers(project.cwd, stale, state.report);
  expect(stale.tasks[0]?.status).toBe("on_hold");
});

test("a failed save leaves the question pending", async ({ project }) => {
  const state = await heldView(project.cwd, 1);
  await writeFile(join(project.cwd, ".maestrun/run.json"), JSON.stringify(viewReport()));
  vi.mocked(input).mockResolvedValueOnce("Compact");
  const task = state.report.tasks[0];
  assert(task);
  taskInstructions(state, task);
  await state.choosing;
  expect(state.report?.tasks[0]?.status).toBe("on_hold");
  expect(state.selection?.filter).toBe(FILTERS.indexOf("Input"));
  expect(state.notice).toContain("no longer pending");
});
