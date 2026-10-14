import type { RunReport, TaskState } from "../../contracts/run.js";
import { createRunView } from "./run-view.js";
import { stateLine } from "./run-report.repository.js";
import { sessionReport } from "./run-session.repository.js";
import { readConversation } from "./task-conversation.repository.js";
import { taskInstructions } from "./task-instructions.js";
import { FILTERS, selectedIndex, visibleTasks } from "./run-view-state.js";

import type { SessionView } from "./execution.types.js";

export function openSessionView(state: SessionView): void {
  if (!state.report || state.view || state.choosing || state.detached || state.closed) return;
  state.selection ??= {
    filter: 0,
    selected: state.report.tasks[0]?.id ?? "",
    details: false,
    scroll: 0,
  };
  const view = createRunView(state.report, state.cwd, {
    selection: state.selection,
    input: process.stdin,
    output: process.stdout,
    ...(state.notice ? { notice: state.notice } : {}),
    onInstructions: (task) => taskInstructions(state, task),
    onClose: () => {
      state.closed = true;
    },
  });
  if (view) state.view = view;
}

export function closeSessionView(state: SessionView): void {
  state.view?.close();
  delete state.view;
}

export async function refreshSessionView(state: SessionView): Promise<void> {
  const report = await sessionReport(state.cwd, state.session);
  if (!report) return;
  focusPendingInput(state, report);
  await Promise.all(
    report.tasks.map(async (task) => {
      if (!task.conversationId) return;
      const conversation = await readConversation(state.cwd, task.conversationId);
      if (conversation) task.conversation = conversation;
    }),
  );
  if (state.selection?.details && state.selection.logs) {
    const tasks = visibleTasks(report, state.selection.filter);
    const task = tasks[selectedIndex(tasks, state.selection)];
    if (task) await loadStepConversations(state.cwd, task);
  }
  if (state.report) Object.assign(state.report, report);
  else state.report = report;
  openSessionView(state);
  if (state.view) state.view.update();
  else if (!state.choosing) logUpdates(state, report);
}

function focusPendingInput(state: SessionView, report: RunReport): void {
  const held = report.tasks.find((task) => task.status === "on_hold");
  if (
    !held ||
    state.choosing ||
    state.selection?.details ||
    state.report?.tasks.some((task) => task.status === "on_hold")
  )
    return;
  state.selection ??= { filter: 0, selected: "", details: false, scroll: 0 };
  delete state.selection.flowStep;
  Object.assign(state.selection, {
    filter: FILTERS.indexOf("Input"),
    selected: held.id,
    details: false,
    scroll: 0,
  });
}

async function loadStepConversations(cwd: string, task: TaskState): Promise<void> {
  await Promise.all(
    (task.steps ?? []).map(async (step) => {
      if (!step.conversationId) return;
      const conversation =
        step.conversationId === task.conversationId
          ? task.conversation
          : await readConversation(cwd, step.conversationId);
      if (conversation) step.conversation = conversation;
    }),
  );
}

function logUpdates(state: SessionView, report: RunReport): void {
  for (const task of report.tasks) {
    const line = stateLine(task);
    if (state.lines.get(task.id) !== line) state.ui.log(line);
    state.lines.set(task.id, line);
  }
}
