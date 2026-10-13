import { expect, test } from "vitest";
import stringWidth from "string-width";
import type { TaskConversation, TaskState } from "../../contracts/run.js";
import { viewReport, viewState, viewTask } from "../../../tests/helpers/run-view.js";
import { taskStepOutput } from "./task-step-output.js";
import { taskBody } from "./run-task-view.js";
import { navigateView } from "./run-view-state.js";

function conversation(text: string): TaskConversation {
  return { active: false, messages: [{ id: "1", role: "model", text }] };
}

function completedTask(): TaskState {
  return {
    ...viewTask(),
    status: "completed",
    step: "testing",
    completedSteps: 2,
    totalSteps: 2,
    steps: [
      {
        id: "implementation",
        title: "Implementation",
        status: "completed",
        summary: "Added validation.",
        conversation: conversation("Inspecting inputs.\nEditing parser."),
      },
      {
        id: "testing",
        title: "Tests",
        status: "completed",
        summary: "All tests passed.",
        conversation: conversation("Running tests."),
      },
    ],
  };
}

test("opening a task shows every result in order and L toggles complete step logs", () => {
  const report = { ...viewReport(), tasks: [completedTask()] };
  const state = viewState();
  const body = (): string => taskBody(report, state, { width: 100, height: 100 }).join("\n");
  navigateView(state, report, { name: "return" });
  expect(body()).toMatch(
    /Implementation · Done[\s\S]*Added validation\.[\s\S]*Tests · Done[\s\S]*All tests passed\./u,
  );
  expect(body()).not.toContain("Inspecting inputs.");
  navigateView(state, report, { name: "l" });
  expect(body()).toContain("Inspecting inputs.\nEditing parser.");
  expect(body()).toContain("Running tests.");
  navigateView(state, report, { name: "l" });
  expect(body()).not.toContain("Running tests.");
  expect(body()).toContain("All tests passed.");
});

test("reopening another task starts with results and resets log scrolling", () => {
  const report = { ...viewReport(), tasks: [completedTask(), { ...completedTask(), id: "b" }] };
  const state = { ...viewState(), details: true, logs: true, scroll: 20, follow: true };
  navigateView(state, report, { name: "escape" });
  navigateView(state, report, { name: "down" });
  navigateView(state, report, { name: "return" });
  expect(state).toMatchObject({
    selected: "b",
    details: true,
    logs: false,
    scroll: 0,
    follow: false,
  });
});

test.each(["pending", "running", "failed", "refactor", "cancelled", "completed"] as const)(
  "%s steps have explicit empty results and logs",
  (status) => {
    const task = { ...viewTask(), steps: [{ id: "custom", title: "Custom step", status }] };
    const text = taskStepOutput(task, true).join("\n");
    expect(text).toContain("Custom step");
    expect(text).toContain("No log recorded for this step.");
    expect(text).toContain(
      status === "pending"
        ? "has not started"
        : status === "running"
          ? "Waiting for the final result"
          : "No final result recorded",
    );
  },
);

test("legacy conversations belong only to the current step and include delivery failures", () => {
  const task = completedTask();
  task.steps?.forEach((step) => {
    delete step.conversation;
  });
  task.error = "Tests failed.";
  delete task.steps?.[1]?.summary;
  task.conversation = {
    active: false,
    messages: [
      {
        id: "1",
        role: "user",
        text: "Check empty input.",
        status: "rejected",
        error: "Session ended.",
      },
    ],
  };
  const text = taskStepOutput(task, true).join("\n");
  expect(text).toMatch(/Implementation[\s\S]*No log recorded[\s\S]*Tests/u);
  expect(text).toMatch(
    /Tests[\s\S]*Error: Tests failed\.[\s\S]*You · rejected[\s\S]*Check empty input\.[\s\S]*Session ended\./u,
  );
  expect(text.match(/Check empty input\./gu)).toHaveLength(1);
});

test("reports without step history retain the final result and optional conversation", () => {
  const task = {
    ...viewTask(),
    summary: "Legacy result.",
    conversation: {
      active: false,
      messages: [{ id: "1", role: "model" as const, text: "Legacy log." }],
    },
  };
  expect(taskStepOutput(task, false)).toEqual(["Legacy result."]);
  expect(taskStepOutput(task, true)).toContain("Legacy log.");
  expect(taskStepOutput(viewTask(), false)).toContain("Step results unavailable.");
});

test.each([32, 79, 119])(
  "multiline Unicode logs wrap and scroll without overflowing %i columns",
  (width) => {
    const report = { ...viewReport(), tasks: [completedTask()] };
    const step = report.tasks[0]?.steps?.[0];
    if (step) step.summary = "First line\n\n" + "日本語 👩‍💻 ".repeat(40) + "\nLast line\x1b[2J";
    const state = { ...viewState(), details: true, logs: true };
    const full = taskBody(report, state, { width, height: 500 });
    expect(full[full.indexOf("First line") + 1]).toBe("");
    expect(full).toContain("Last line");
    full.forEach((line) => expect(stringWidth(line)).toBeLessThanOrEqual(width));
    navigateView(state, report, { name: "down" });
    expect(taskBody(report, state, { width, height: 5 })).toEqual(full.slice(1, 6));
  },
);
