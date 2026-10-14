import { afterEach, expect, test, vi } from "vitest";
import { createRunView } from "./run-view.js";
import { viewReport, viewTerminal } from "../../../tests/helpers/run-view.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("renders live updates, keys and resize, then restores the terminal once", () => {
  vi.stubEnv("TERM", "xterm-256color");
  vi.useFakeTimers();
  const terminal = viewTerminal();
  const report = viewReport();
  const view = createRunView(report, "/project", terminal);
  expect(view).toBeDefined();
  expect(terminal.frames[0]).toContain("\x1b[?1049h\x1b[?25l");
  expect(terminal.input.setRawMode).toHaveBeenCalledWith(true);
  terminal.input.emit("keypress", "", { name: "down" });
  expect(terminal.frames.at(-1)).toContain("› b");
  terminal.input.emit("keypress", "", { name: "return" });
  expect(terminal.frames.at(-1)).toContain("Task details");
  terminal.output.columns = 60;
  terminal.output.emit("resize");
  const task = report.tasks[1];
  if (task) task.status = "running";
  view?.update();
  expect(terminal.frames.at(-1)).toContain("● Working");
  vi.advanceTimersByTime(1000);
  view?.close();
  view?.close();
  expect(terminal.frames.filter((frame) => frame.includes("\x1b[?1049l"))).toHaveLength(1);
  expect(terminal.input.setRawMode).toHaveBeenLastCalledWith(false);
  expect(terminal.input.isPaused()).toBe(true);
  expect(terminal.input.listenerCount("keypress")).toBe(0);
  expect(terminal.output.listenerCount("resize")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("Ctrl+C reaches the existing run cancellation handler", () => {
  vi.stubEnv("TERM", "xterm");
  const terminal = viewTerminal();
  const interrupt = vi.fn();
  process.on("SIGINT", interrupt);
  const view = createRunView(viewReport(), "/project", terminal);
  try {
    terminal.input.emit("keypress", "\x03", { name: "c", ctrl: true });
    expect(interrupt).toHaveBeenCalledOnce();
  } finally {
    view?.close();
    process.removeListener("SIGINT", interrupt);
  }
});

test.each(["input", "output", "dumb"])("leaves %s terminals untouched", (mode) => {
  vi.stubEnv("TERM", mode === "dumb" ? "dumb" : "xterm");
  const terminal = viewTerminal();
  if (mode === "input" || mode === "output") terminal[mode].isTTY = false;
  expect(createRunView(viewReport(), "/project", terminal)).toBeUndefined();
  expect(terminal.frames).toEqual([]);
  expect(terminal.input.setRawMode).not.toHaveBeenCalled();
});

test("instructions target the selected task and reopening keeps view selection", () => {
  vi.stubEnv("TERM", "xterm");
  const terminal = viewTerminal();
  const report = viewReport();
  const selection = { filter: 0, selected: "a", details: false, scroll: 0, flow: true };
  const onInstructions = vi.fn();
  const options = { ...terminal, selection, onInstructions };
  const view = createRunView(report, "/project", options);
  terminal.input.emit("keypress", "", { name: "down" });
  terminal.input.emit("keypress", "i", { name: "i" });
  expect(onInstructions).toHaveBeenCalledWith(report.tasks[1]);
  terminal.input.emit("keypress", "f", { name: "f" });
  expect(selection.flow).toBe(false);
  view?.close();
  const reopened = createRunView(report, "/project", options);
  expect(terminal.frames.at(-1)).toContain("› b");
  expect(selection.flow).toBe(false);
  reopened?.close();
});

test("finished views allow details and flow navigation until Escape closes the list", () => {
  vi.stubEnv("TERM", "xterm");
  const terminal = viewTerminal();
  const report = { ...viewReport(), finishedAt: new Date().toISOString() };
  const onClose = vi.fn();
  const view = createRunView(report, "/project", { ...terminal, onClose });
  try {
    terminal.input.emit("keypress", "", { name: "return" });
    expect(terminal.frames.at(-1)).toContain("Task details");
    expect(onClose).not.toHaveBeenCalled();
    terminal.input.emit("keypress", "", { name: "escape" });
    expect(onClose).not.toHaveBeenCalled();
    terminal.input.emit("keypress", "f", { name: "f" });
    expect(terminal.frames.at(-1)).not.toContain("[ Flow ]");
    terminal.input.emit("keypress", "", { name: "escape" });
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    view?.close();
  }
});

test.each([0, 5])("Enter answers the selected held task in filter %i", (filter) => {
  vi.stubEnv("TERM", "xterm");
  const terminal = viewTerminal();
  const report = viewReport();
  const held = report.tasks[1];
  if (!held) throw new Error("Missing task");
  held.status = "on_hold";
  const selection = { filter, selected: held.id, details: false, scroll: 0 };
  const onInstructions = vi.fn();
  const view = createRunView(report, "/project", { ...terminal, selection, onInstructions });
  try {
    terminal.input.emit("keypress", "\r", { name: "return" });
    expect(onInstructions).toHaveBeenCalledExactlyOnceWith(held);
    expect(selection.details).toBe(false);
    expect(terminal.frames.at(-1)).toContain("Enter full question + answer");
    held.status = "completed";
    selection.filter = 0;
    terminal.input.emit("keypress", "\r", { name: "return" });
    expect(onInstructions).toHaveBeenCalledOnce();
    expect(selection.details).toBe(true);
  } finally {
    view?.close();
  }
});
