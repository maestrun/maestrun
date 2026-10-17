import { expect, test } from "vitest";
import stringWidth from "string-width";
import { buildReport } from "./run-checkpoint.js";
import { orchestrationFlowLayout } from "./orchestration-flow-layout.js";
import { orchestrationFlowchart } from "./orchestration-flowchart.js";
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
  for (const task of report.tasks.slice(1)) task.parentId = "a";
  return report;
}

test.for([false, true])(
  "vertical layout places descendants below parents, detailed=%s",
  (detailed) => {
    const report = fixture();
    const parent = report.tasks[1];
    if (!parent) throw new Error("Missing fixture");
    parent.error = "Check this";
    report.tasks.push({ ...parent, id: "grandchild", parentId: parent.id, steps: [] });
    const layout = orchestrationFlowLayout(report.tasks, detailed, "vertical");
    for (const node of layout.nodes) {
      const parent = layout.nodes.find((entry) => entry.task.id === node.task.parentId);
      if (parent) expect(node.y).toBeGreaterThan(parent.y + parent.lines.length);
      for (const line of node.lines) expect(stringWidth(line)).toBe(node.width);
      if (detailed && node.task.steps?.length) {
        expect(node.lines.findIndex((line) => line.includes("Tests"))).toBeGreaterThan(
          node.lines.findIndex((line) => line.includes("Implementation")),
        );
        expect(node.lines.join("\n")).toContain("▼");
      }
    }
    const siblings = layout.nodes.filter((node) => node.depth === 1);
    expect(siblings[0]?.y).toBe(siblings[1]?.y);
    expect((siblings[0]?.x ?? 0) + (siblings[0]?.width ?? 0)).toBeLessThan(siblings[1]?.x ?? 0);
    expect(layout.parts.some((part) => part.text === "▼" && !part.node)).toBe(true);
  },
);

test("direction toggle preserves selection and detail mode, resets pan, and survives navigation", () => {
  const report = fixture();
  const state: ViewState = {
    filter: 0,
    selected: "b",
    details: false,
    treeDetails: true,
    flow: true,
    scroll: 10,
    flowPan: 40,
  };
  navigateView(state, report, { name: "v" });
  expect(state).toMatchObject({
    flowDirection: "vertical",
    selected: "b",
    treeDetails: true,
    scroll: 0,
    flowPan: 0,
  });
  const render = (): string[] => orchestrationFlowchart(report, state, { width: 50, height: 15 });
  expect(render().join("\n")).toContain("Flow ↓");
  for (const key of ["pagedown", "end", "home", "down", "tab", "return", "escape", "f", "f"])
    navigateView(state, report, { name: key });
  expect(state.flowDirection).toBe("vertical");
  navigateView(state, report, { name: "v" });
  expect(state.flowDirection).toBe("horizontal");
  expect(render().join("\n")).toContain("Flow →");
});

test("vertical diagrams clip wide Unicode and pan to siblings", () => {
  const report = fixture();
  for (const task of report.tasks) task.title = "日本語 👩🏽‍💻 é";
  const state: ViewState = {
    filter: 0,
    selected: "a",
    details: false,
    flow: true,
    treeDetails: true,
    flowDirection: "vertical",
    scroll: 0,
  };
  for (const width of [20, 80]) {
    for (const key of ["home", "pagedown", "end", "pageup"]) {
      navigateView(state, report, { name: key });
      navigateView(state, report, { name: "right", shift: true });
      const lines = orchestrationFlowchart(report, state, { width, height: 12 });
      expect(lines.length).toBeLessThanOrEqual(12);
      for (const line of lines) expect(stringWidth(line)).toBe(width);
    }
  }
});

test("vertical layout supports forests and empty views", () => {
  const report = fixture();
  for (const task of report.tasks) delete task.parentId;
  const forest = orchestrationFlowLayout(report.tasks, false, "vertical");
  expect(new Set(forest.nodes.map((node) => node.y))).toEqual(new Set([0]));
  expect(new Set(forest.nodes.map((node) => node.x)).size).toBe(3);
  expect(orchestrationFlowLayout([], true, "vertical")).toMatchObject({
    nodes: [],
    parts: [],
    width: 0,
    height: 0,
  });
});

test("V leaves task details and ordinary workflows unchanged", () => {
  const report = fixture();
  const state: ViewState = {
    filter: 0,
    selected: "a",
    details: false,
    flow: true,
    flowDirection: "horizontal",
    scroll: 0,
  };
  state.details = true;
  navigateView(state, report, { name: "v" });
  expect(state.flowDirection).toBe("horizontal");
  state.details = false;
  delete report.orchestration;
  navigateView(state, report, { name: "v" });
  expect(state.flowDirection).toBe("horizontal");
});
