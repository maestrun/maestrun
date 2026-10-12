import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { expect, test } from "vitest";
import { DEFAULT_LAYOUT } from "../../contracts/layout.js";
import type { Layout } from "../../contracts/layout.js";
import { viewReport, viewState } from "../../../tests/helpers/run-view.js";
import { executionBody } from "./task-flowchart.js";
import { renderRunScreen } from "./run-screen.js";
import { row } from "./run-columns.js";

const layout: Layout = {
  columns: [
    { id: "name", width: "auto" },
    { id: "task", width: 10 },
    { id: "status", width: 14 },
  ],
  flowchart: { ...DEFAULT_LAYOUT.flowchart, width: 30, height: 10 },
};

test("custom headers and values share column order and widths without hidden model lines", () => {
  const lines = executionBody(
    viewReport(),
    { ...viewState(), layout },
    { width: 60, height: 15 },
  ).map(stripVTControlCharacters);
  expect(lines[0]?.indexOf("Name")).toBe(0);
  expect(lines[0]?.indexOf("Task")).toBe(37);
  expect(lines[0]?.indexOf("Status")).toBe(46);
  expect(lines[1]?.indexOf("Build the application")).toBe(0);
  expect(lines[1]?.indexOf("› a")).toBe(35);
  expect(lines[1]?.indexOf("● Working")).toBe(46);
  expect(lines.join("\n")).not.toContain("code-test");
  expect(lines).toHaveLength(5);
});

test("auto columns share spare space and fixed columns clip safely at narrow widths", () => {
  const values = ["task", "日本語 👩‍💻".repeat(10), "status"];
  for (const width of [1, 10, 25, 40, 80]) {
    const line = row(values, width, layout.columns);
    expect(stringWidth(line)).toBe(width);
    if (width <= 25) expect(line).not.toContain("status");
  }
  expect(
    row(["a", "b"], 31, [
      { id: "task", width: "auto" },
      { id: "name", width: "auto" },
    ]).indexOf("b"),
  ).toBe(16);
});

test.each(["left", "right", "top", "bottom"] as const)(
  "positions the flowchart at %s",
  (position) => {
    const state = {
      ...viewState(),
      flow: true,
      layout: { ...layout, flowchart: { ...layout.flowchart, position } },
    };
    const lines = executionBody(viewReport(), state, { width: 120, height: 24 }).map(
      stripVTControlCharacters,
    );
    const chart = lines.findIndex((line) => line.includes("[ Flow ]"));
    const table = lines.findIndex((line) => line.includes("Name"));
    if (position === "top") {
      expect(chart).toBe(0);
      expect(table).toBe(11);
    }
    if (position === "bottom") {
      expect(table).toBe(0);
      expect(chart).toBe(14);
    }
    if (position === "left") {
      expect(lines[0]?.indexOf("│")).toBe(31);
      expect(lines[0]?.indexOf("Name")).toBe(33);
    }
    if (position === "right") expect(lines[0]?.indexOf("│")).toBe(88);
    expect(lines).toHaveLength(24);
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(120);
  },
);

test.each(["left", "right", "top", "bottom"] as const)(
  "%s handles resizing and extreme sizes",
  (position) => {
    const report = viewReport();
    Object.assign(report.tasks[0] ?? {}, {
      title: "日本語 👩‍💻".repeat(50),
      steps: [
        { id: "implementation", title: "Implementation", status: "completed" },
        { id: "qa", title: "QA", status: "refactor" },
      ],
    });
    for (const columns of [20, 33, 80, 97, 160]) {
      for (const rows of [10, 12, 24, 50]) {
        const state = {
          ...viewState(),
          flow: true,
          layout: {
            ...layout,
            flowchart: { ...layout.flowchart, position, width: 9999, height: 9999 },
          },
        };
        const text = stripVTControlCharacters(
          renderRunScreen(report, state, { cwd: "/project", columns, rows, now: Date.now() }),
        );
        expect(text.split("\r\n").length).toBeLessThanOrEqual(rows);
        for (const line of text.split("\r\n")) expect(stringWidth(line)).toBeLessThan(columns);
      }
    }
  },
);

test.each(["left", "right", "top", "bottom"] as const)(
  "%s keeps browsing and details accessible",
  (position) => {
    const report = viewReport();
    const state = {
      ...viewState(),
      flow: true,
      flowStep: "qa",
      layout: { ...layout, flowchart: { ...layout.flowchart, position } },
    };
    expect(executionBody(report, state, { width: 50, height: 10 }).join("\n")).toContain(
      "[ Flow ]",
    );
    expect(
      executionBody(report, { ...state, details: true }, { width: 50, height: 10 }).join("\n"),
    ).not.toContain("[ Flow ]");
  },
);

test("oversized flowcharts leave room for default columns and empty states", () => {
  for (const tasks of [[], viewReport().tasks]) {
    const state = {
      ...viewState(),
      flow: true,
      layout: { flowchart: { ...DEFAULT_LAYOUT.flowchart, width: 9999 } },
    };
    const lines = executionBody({ ...viewReport(), tasks }, state, { width: 96, height: 15 });
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(96);
  }
});
