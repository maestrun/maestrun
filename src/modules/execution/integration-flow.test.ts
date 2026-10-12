import { expect, test } from "vitest";
import { stripVTControlCharacters } from "node:util";
import type { TaskState } from "../../contracts/run.js";
import { viewState, viewTask } from "../../../tests/helpers/run-view.js";
import { RUN_CONFIG } from "../../../tests/helpers/run.js";
import { initialTaskState } from "./scheduler.js";
import { taskDisplaySteps } from "./task-display-steps.js";
import { taskFlowchart } from "./task-flowchart.js";
import { navigateView } from "./run-view-state.js";

function task(): TaskState {
  return {
    ...viewTask(),
    step: "integration",
    worktree: { id: "test", base: "base" },
    steps: [
      { id: "implementation", title: "Implementation", status: "completed" },
      { id: "custom:Audit", title: "Audit", status: "completed" },
      { id: "review", title: "Review", status: "completed" },
    ],
  };
}

test.each([
  [{ integration: "pending" }, "Waiting"],
  [{ integration: "running" }, "In progress"],
  [{ status: "failed" }, "Error"],
  [{ status: "cancelled" }, "Cancelled"],
  [{ status: "completed", worktree: { id: "test", base: "base", integrated: true } }, "Done"],
] satisfies [Partial<TaskState>, string][])(
  "integration displays its actual state %j",
  (update, label) => {
    const current = { ...task(), ...update };
    const text = stripVTControlCharacters(
      taskFlowchart(current, { width: 45, height: 10 }).join("\n"),
    );
    expect(text).toContain("Integration");
    expect(text).toContain(label);
    expect(text).toContain("Git · local");
    expect(text).toContain("in: 0 · out: 0");
    expect(current.steps).toHaveLength(3);
  },
);

test("all configured and integration steps can be reached in a small terminal", () => {
  const current = task();
  const report = { version: 1 as const, startedAt: "now", tasks: [current] };
  const state = viewState();
  navigateView(state, report, { name: "home" });
  for (const title of ["Implementation", "Audit", "Review", "Integration"]) {
    const text = taskFlowchart(current, { width: 45, height: 10 }, state.flowStep).join("\n");
    expect(text).toContain(title);
    navigateView(state, report, { name: "pagedown" });
  }
  navigateView(state, report, { name: "end" });
  expect(state.flowStep).toBe("integration");
  navigateView(state, report, { name: "pageup" });
  expect(state.flowStep).toBe("review");
});

test("parallel tasks show pending Integration before worktree allocation; sequential tasks do not", () => {
  const definition = { id: "a", title: "Task", instructions: "Do it", dependsOn: [] };
  const sequential = initialTaskState(RUN_CONFIG, definition);
  const parallel = initialTaskState(
    { ...RUN_CONFIG, execution: { mode: "parallel", concurrency: 2 } },
    definition,
  );
  expect(taskDisplaySteps(sequential).some((step) => step.id === "integration")).toBe(false);
  expect(taskDisplaySteps(parallel).at(-1)).toMatchObject({ id: "integration", status: "pending" });
  expect(taskDisplaySteps({ ...task(), step: "implementation" }).at(-1)?.status).toBe("pending");
});
