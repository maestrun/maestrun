import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { expect, test, vi } from "vitest";
import { navigateView } from "./run-view-state.js";
import { executionBody } from "./task-flowchart.js";
import { createRunView } from "./run-view.js";
import { viewReport, viewState, viewTerminal } from "../../../tests/helpers/run-view.js";

function report() {
  const value = viewReport();
  Object.assign(value.tasks[0] ?? {}, {
    step: "step-4",
    steps: Array.from({ length: 8 }, (_, i) => ({
      id: `step-${i}`,
      title: `Step ${i}`,
      status: "pending",
    })),
  });
  return value;
}

test("browses from the active step and clamps at the first and last steps", () => {
  const data = report();
  const state = viewState();
  navigateView(state, data, { name: "pageup" });
  expect(state).toMatchObject({ selected: "a", flow: true, flowStep: "step-3" });
  navigateView(state, data, { name: "pagedown" });
  expect(state.flowStep).toBe("step-4");
  for (const name of ["end", "pagedown"]) {
    navigateView(state, data, { name });
    expect(state.flowStep).toBe("step-7");
  }
  for (const name of ["home", "pageup"]) {
    navigateView(state, data, { name });
    expect(state.flowStep).toBe("step-0");
  }
  expect(state.selected).toBe("a");
});

test.each([119, 79, 32])(
  "keeps a browsed step visible at width %i as execution progresses",
  (width) => {
    const data = report();
    const state = viewState();
    navigateView(state, data, { name: "end" });
    Object.assign(data.tasks[0] ?? {}, { step: "step-0" });
    const lines = executionBody(data, state, { width, height: 15 });
    const text = stripVTControlCharacters(lines.join("\n"));
    expect(text).toContain("› Step 7");
    expect(text).toContain("earlier steps");
    expect(text).not.toContain("› Step 0");
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
    expect(lines.length).toBeLessThanOrEqual(15);
    navigateView(state, data, { name: "escape" });
    expect(state.flowStep).toBeUndefined();
    expect(executionBody(data, state, { width, height: 15 }).join("\n")).toContain("in/out");
  },
);

test.each(["down", "tab", "left", "right", "f"])(
  "%s clears step browsing when changing views",
  (name) => {
    const data = report();
    const state = viewState();
    navigateView(state, data, { name: "end" });
    navigateView(state, data, { name });
    expect(state.flowStep).toBeUndefined();
  },
);

test("navigation safely handles tasks without step history and empty filters", () => {
  const state = viewState();
  const data = viewReport();
  for (const name of ["pageup", "pagedown", "home", "end"]) navigateView(state, data, { name });
  data.tasks = [];
  navigateView(state, data, { name: "end" });
  expect(state.flowStep).toBeUndefined();
});

test("terminal keys browse completed flowcharts and Escape returns before closing", () => {
  vi.stubEnv("TERM", "xterm");
  const data = { ...report(), finishedAt: new Date().toISOString() };
  const terminal = viewTerminal();
  const onClose = vi.fn();
  const view = createRunView(data, "/project", { ...terminal, onClose });
  try {
    terminal.input.emit("keypress", "", { name: "end" });
    expect(stripVTControlCharacters(terminal.frames.at(-1) ?? "")).toContain("› Step 7");
    terminal.output.columns = 60;
    terminal.output.emit("resize");
    expect(stripVTControlCharacters(terminal.frames.at(-1) ?? "")).toContain("› Step 7");
    terminal.input.emit("keypress", "", { name: "escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(terminal.frames.at(-1)).toContain("in/out");
    terminal.input.emit("keypress", "", { name: "escape" });
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    view?.close();
    vi.unstubAllEnvs();
  }
});
