import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import stringWidth from "string-width";
import { expect, test } from "vitest";
import { renderRunScreen } from "./run-screen.js";
import { navigateView, visibleTasks } from "./run-view-state.js";
import { holdTask } from "./task-input.js";
import { StepInputRequired } from "../../shared/errors.js";
import { heldTaskLines } from "./task-input-view.js";
import { taskFlowchart } from "./task-flowchart.js";
import { viewReport, viewState } from "../../../tests/helpers/run-view.js";

function heldReport(): ReturnType<typeof viewReport> {
  const report = viewReport();
  for (const task of report.tasks.slice(0, 2)) {
    task.step = "implementation";
    task.steps = [{ id: "implementation", title: "Implementation", status: "running" }];
    holdTask(task, new StepInputRequired(`Which region for ${task.id}?`, "Choose where to run."));
  }
  return report;
}

test.each([120, 80, 50, 33])(
  "pending inputs fit %i columns and remain keyboard accessible",
  (columns) => {
    const report = heldReport();
    const state = viewState();
    navigateView(state, report, { name: "h" });
    expect(visibleTasks(report, state.filter).map((task) => task.id)).toEqual(["a", "b"]);
    const render = (): string =>
      stripVTControlCharacters(
        renderRunScreen(report, state, { cwd: "/project", columns, rows: 30, now: 0 }),
      );
    expect(render()).toContain("2 awaiting input");
    expect(render()).toContain("Which region for a?");
    expect(render()).toContain("Which region for b?");
    for (const line of render().split("\r\n")) expect(stringWidth(line)).toBeLessThan(columns);
    navigateView(state, report, { name: "down" });
    expect(state.selected).toBe("b");
    navigateView(state, report, { name: "return" });
    expect(render()).toContain("Choose where to run.");
    expect(render()).toContain("Model: Which region for b?");
  },
);

test("held task and step borders are orange with a text label when colors are unavailable", () => {
  const task = heldReport().tasks[0];
  if (!task) throw new Error("Missing task");
  const previous = chalk.level;
  try {
    chalk.level = 3;
    expect(heldTaskLines(task, true, 70).join("\n")).toContain("\x1b[38;2;255;170;51m");
    expect(taskFlowchart(task, { width: 70, height: 15 }).join("\n")).toContain(
      "\x1b[38;2;255;170;51m",
    );
    chalk.level = 0;
    expect(heldTaskLines(task, true, 70).join("\n")).toContain("On hold · awaiting your input");
  } finally {
    chalk.level = previous;
  }
});
