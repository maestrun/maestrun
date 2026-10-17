import { expect, test } from "vitest";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { buildReport } from "./run-checkpoint.js";
import { orchestrationFlowchart } from "./orchestration-flowchart.js";
import { orchestrationFlowLayout } from "./orchestration-flow-layout.js";
import { orchestrationFlowNode } from "./orchestration-flow-node.js";
import { navigateView, type ViewState } from "./run-view-state.js";
import { RUN_CONFIG, TASKS } from "../../../tests/helpers/run.js";

function fixture(): ReturnType<typeof buildReport> {
  const report = buildReport(RUN_CONFIG, TASKS, { previous: [] });
  report.orchestration = {
    strategy: "plan",
    source: TASKS,
    tasks: TASKS,
    phase: "execute",
    round: 1,
  };
  for (const [index, task] of report.tasks.entries()) {
    const parent = report.tasks[index - 1];
    if (parent) task.parentId = parent.id;
  }
  return report;
}

test("every generation goes right and every task contains its own left-to-right step flow", () => {
  const tasks = fixture().tasks;
  const layout = orchestrationFlowLayout(tasks, true);
  expect(layout.nodes).toHaveLength(3);
  for (const node of layout.nodes) {
    const parent = layout.nodes.find((entry) => entry.task.id === node.task.parentId);
    if (parent) expect(node.x).toBeGreaterThan(parent.x + parent.width);
    const steps = node.lines.find((line) => line.includes("Implementation")) ?? "";
    expect(steps).toContain("Tests");
    expect(steps.indexOf("Implementation")).toBeLessThan(steps.indexOf("Tests"));
    expect(steps).toContain("──▶");
    for (const line of node.lines) expect(stringWidth(line)).toBe(node.width);
  }
});

test("sibling subtrees do not overlap and filters, selection and horizontal panning coexist", () => {
  const report = fixture();
  const state: ViewState = {
    filter: 0,
    selected: "a",
    details: false,
    flow: true,
    treeDetails: true,
    scroll: 0,
  };
  const size = { width: 64, height: 16 };
  const render = (): string => orchestrationFlowchart(report, state, size).join("\n");
  expect(render()).toContain("› A");
  for (let i = 0; i < 30; i++) navigateView(state, report, { name: "right", shift: true });
  expect(render()).toContain("C [c]");
  const pan = state.flowPan;
  navigateView(state, report, { name: "pagedown" });
  render();
  expect(state.flowPan).toBe(pan);
  expect(state.filter).toBe(0);
  for (let i = 0; i < 30; i++) navigateView(state, report, { name: "left", shift: true });
  expect(render()).toContain("› A");
  navigateView(state, report, { name: "down" });
  expect(render()).toContain("› B [b]");
  navigateView(state, report, { name: "tab" });
  expect(state.filter).toBe(1);
  const tasks = report.tasks.map((task) => (task.id === "c" ? { ...task, parentId: "a" } : task));
  const nodes = orchestrationFlowLayout(tasks, true).nodes.filter((node) => node.depth === 1);
  expect(nodes[0]?.y).toBeLessThan((nodes[1]?.y ?? 0) - (nodes[0]?.lines.length ?? 0));
});

test("nested nodes include errors, integration and variable task steps", () => {
  const task = fixture().tasks[0];
  if (!task) throw new Error("Missing task");
  task.title = "日本語 👩🏽‍💻 é";
  task.error = "Review required";
  task.step = "integration";
  const lines = orchestrationFlowNode(task, true);
  expect(lines.join("\n")).toContain("Review required");
  expect(lines.join("\n")).toContain("Integration");
  expect(lines.join("\n")).toContain("Git · local");
  expect(new Set(lines.map((line) => stringWidth(line))).size).toBe(1);
  const plain = orchestrationFlowNode({ ...task, steps: [] }, true).join("\n");
  expect(plain).not.toContain("Implementation");
});

test.for([32, 80, 180])(
  "horizontal clipping preserves Unicode display width at %i columns",
  (width) => {
    const report = fixture();
    for (const task of report.tasks) task.title = "日本語 👩🏽‍💻 é";
    const state: ViewState = {
      filter: 0,
      selected: "a",
      details: false,
      flow: true,
      treeDetails: true,
      scroll: 0,
    };
    for (let i = 0; i < 8; i++) {
      const lines = orchestrationFlowchart(report, state, { width, height: 12 });
      expect(lines.length).toBeLessThanOrEqual(12);
      for (const line of lines) expect(stringWidth(stripVTControlCharacters(line))).toBe(width);
      navigateView(state, report, { name: "right", shift: true });
    }
  },
);

test("empty filtered diagrams and very short viewports remain usable", () => {
  const report = fixture();
  const state: ViewState = {
    filter: 2,
    selected: "a",
    details: false,
    flow: true,
    scroll: Infinity,
  };
  expect(orchestrationFlowchart(report, state, { width: 80, height: 12 }).join("\n")).toContain(
    "No tasks",
  );
  expect(Number.isFinite(state.scroll)).toBe(true);
  expect(orchestrationFlowchart(report, state, { width: 80, height: 1 })).toHaveLength(1);
});
