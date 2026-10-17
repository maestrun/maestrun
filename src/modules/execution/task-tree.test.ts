import { expect, test } from "vitest";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { buildReport } from "./run-checkpoint.js";
import { taskTree, treeTasks } from "./task-tree.js";
import { navigateView, visibleTasks, type ViewState } from "./run-view-state.js";
import { renderRunScreen } from "./run-screen.js";
import { executionBody } from "./task-flowchart.js";
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
  const [a, b, c] = report.tasks;
  if (!a || !b || !c) throw new Error("Missing fixture tasks");
  b.parentId = a.id;
  c.parentId = b.id;
  c.status = "failed";
  return report;
}

test("tree preserves ancestors in filters and nests children in depth-first order", () => {
  const report = fixture();
  expect(visibleTasks(report, 4).map((task) => task.id)).toEqual(["a", "b", "c"]);
  expect(
    treeTasks({ ...report, tasks: [...report.tasks].reverse() }, report.tasks).map(
      (task) => task.id,
    ),
  ).toEqual(["a", "b", "c"]);
  const text = taskTree(report.tasks, {
    selected: "a",
    treeDetails: true,
    scroll: 0,
    width: 100,
    height: 40,
  }).join("\n");
  expect(text).toContain("└─ B");
  expect(text).toContain("   └─ C");
  expect(text.match(/Implementation/g)).toHaveLength(3);
  expect(text.match(/Tests/g)).toHaveLength(3);
});

test("D expands all task steps, pages scroll and Enter keeps task details", () => {
  const report = fixture();
  const state: ViewState = { selected: "a", filter: 0, details: false, scroll: 0 };
  navigateView(state, report, { name: "d" });
  expect(state.treeDetails).toBe(true);
  navigateView(state, report, { name: "pagedown" });
  expect(state.scroll).toBe(5);
  navigateView(state, report, { name: "down" });
  expect(state.selected).toBe("b");
  expect(state.scroll).toBe(0);
  navigateView(state, report, { name: "return" });
  expect(state.details).toBe(true);
  navigateView(state, report, { name: "escape" });
  navigateView(state, report, { name: "d" });
  expect(state.treeDetails).toBe(false);
});

test.for([40, 80, 140])(
  "expanded tree fits a %i-column terminal and includes statuses",
  (columns) => {
    const report = fixture();
    const state: ViewState = {
      selected: "a",
      filter: 0,
      details: false,
      treeDetails: true,
      flow: true,
      scroll: 0,
    };
    const screen = stripVTControlCharacters(
      renderRunScreen(report, state, { cwd: "/tmp/project", columns, rows: 60, now: Date.now() }),
    );
    expect(screen).toContain("orchestrator (plan)");
    expect(screen).toContain("Implementation");
    state.selected = "c";
    expect(
      renderRunScreen(report, state, { cwd: "/tmp/project", columns, rows: 60, now: Date.now() }),
    ).toContain("failed");
    for (const line of screen.split("\r\n")) expect(stringWidth(line)).toBeLessThan(columns);
  },
);

test("flowchart connects descendants and D adds every task's step boxes", () => {
  const report = fixture();
  const state: ViewState = { selected: "a", filter: 0, details: false, flow: true, scroll: 0 };
  const size = { width: 200, height: 60 };
  const compact = executionBody(report, state, size).join("\n");
  expect(compact).toContain("[ Flow → · Tasks ]");
  expect(compact).toContain("B [b]");
  expect(compact).toContain("C [c]");
  expect(compact.match(/▶/g)).toHaveLength(2);
  expect(compact.match(/┌/g)).toHaveLength(3);
  expect(compact).not.toContain("Implementation");
  navigateView(state, report, { name: "d" });
  const detailed = executionBody(report, state, size).join("\n");
  expect(detailed.match(/┌/g)).toHaveLength(9);
  expect(detailed.match(/Implementation/g)).toHaveLength(3);
  navigateView(state, report, { name: "f" });
  expect(executionBody(report, state, size).join("\n")).not.toContain("┌");
});

test.for([false, true])(
  "tree navigation reaches both ends and can scroll back (details %s)",
  (treeDetails) => {
    const report = fixture();
    const state: ViewState = {
      selected: "a",
      filter: 0,
      details: false,
      flow: true,
      treeDetails,
      scroll: 0,
    };
    const original = report.tasks[1];
    if (!original) throw new Error("Missing fixture");
    report.tasks.push(...Array.from({ length: 5 }, (_, i) => ({ ...original, id: `extra-${i}` })));
    const size = { width: 50, height: 10 };
    navigateView(state, report, { name: "end" });
    const end = executionBody(report, state, size);
    expect(end).toHaveLength(10);
    expect(end.join("\n")).toContain("↓ 0");
    expect(Number.isFinite(state.scroll)).toBe(true);
    const offset = state.scroll;
    navigateView(state, report, { name: "pageup" });
    executionBody(report, state, size);
    expect(state.scroll).toBeLessThan(offset);
    navigateView(state, report, { name: "home" });
    expect(executionBody(report, state, size).join("\n")).toContain("↑ 0");
  },
);
