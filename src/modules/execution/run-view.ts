import type { Readable, Writable } from "node:stream";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";
import type { RunReport, TaskState } from "../../contracts/run.js";
import { renderRunScreen } from "./run-screen.js";
import { navigateView, visibleTasks, selectedIndex } from "./run-view-state.js";
import type { ViewState } from "./run-view-state.js";
import type { RunView } from "../../shared/ui.types.js";
import { loadLayout } from "../../config/index.js";
type Terminal = {
  onClose?: () => void;
  onInstructions?: (task: TaskState) => void;
  notice?: string;
  selection?: ViewState;
  input: Readable & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (raw: boolean) => unknown;
  };
  output: Writable & { isTTY?: boolean; columns?: number; rows?: number };
};

function keyboard(terminal: Terminal, onKey: (text: string, key: Key) => void): () => void {
  const { input } = terminal;
  const raw = input.isRaw ?? false;
  const paused = input.readableFlowing !== true;
  emitKeypressEvents(input);
  input.on("keypress", onKey);
  input.setRawMode?.(true);
  input.resume();
  return () => {
    input.removeListener("keypress", onKey);
    input.setRawMode?.(raw);
    if (paused) input.pause();
  };
}

export function createRunView(
  report: RunReport,
  cwd: string,
  terminal: Terminal = { input: process.stdin, output: process.stdout },
): RunView | undefined {
  if (!terminal.input.isTTY || !terminal.output.isTTY || process.env.TERM === "dumb")
    return undefined;
  const state = initialState(report, cwd, terminal.selection);
  if (terminal.notice) state.notice = terminal.notice;
  else delete state.notice;
  const draw = (): void => drawScreen({ report, state, cwd }, terminal);
  const stopKeys = keyboard(terminal, (_text, key) => {
    if (closeKey(key, { report, state }, terminal)) return;
    if (instructionKey(key, { report, state }, terminal)) return;
    navigateView(state, report, key);
    draw();
  });
  terminal.output.write("\x1b[?1049h\x1b[?25l");
  terminal.output.on("resize", draw);
  const timer = setInterval(draw, 1000);
  timer.unref();
  draw();
  return { update: draw, close: closeView({ terminal, timer, draw, stopKeys }) };
}

function initialState(report: RunReport, cwd: string, selection?: ViewState): ViewState {
  const state: ViewState = selection ?? {
    filter: 0,
    selected: report.tasks[0]?.id ?? "",
    details: false,
    scroll: 0,
  };
  state.layout = loadLayout(cwd);
  state.flow ??= state.layout.flowchart.visible;
  return state;
}

function closeView(input: {
  terminal: Terminal;
  timer: NodeJS.Timeout;
  draw: () => void;
  stopKeys: () => void;
}): () => void {
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    clearInterval(input.timer);
    input.terminal.output.removeListener("resize", input.draw);
    input.stopKeys();
    input.terminal.output.write("\x1b[0m\x1b[?25h\x1b[?1049l");
  };
}

function drawScreen(
  context: { report: RunReport; state: ViewState; cwd: string },
  terminal: Terminal,
): void {
  terminal.output.write(
    `\x1b[H${renderRunScreen(context.report, context.state, {
      cwd: context.cwd,
      columns: terminal.output.columns ?? 80,
      rows: terminal.output.rows ?? 24,
      now: Date.now(),
    })}\x1b[J`,
  );
}

function closeKey(
  key: Key,
  context: { report: RunReport; state: ViewState },
  terminal: Terminal,
): boolean {
  if (key.ctrl && key.name === "c") {
    process.emit("SIGINT");
    return true;
  }
  if (
    context.report.finishedAt &&
    !context.state.details &&
    !context.state.flowStep &&
    terminal.onClose &&
    key.name === "escape"
  ) {
    terminal.onClose();
    return true;
  }
  return false;
}

function instructionKey(
  key: Key,
  context: { report: RunReport; state: ViewState },
  terminal: Terminal,
): boolean {
  if (!terminal.onInstructions) return false;
  const tasks = visibleTasks(context.report, context.state.filter);
  const task = tasks[selectedIndex(tasks, context.state)];
  const answer = key.name === "return" && task?.status === "on_hold" && !context.state.details;
  if (key.name !== "i" && !answer) return false;
  if (task) terminal.onInstructions(task);
  return true;
}
