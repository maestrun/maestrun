import type { TaskSelection } from "./task-selection.js";
import { setTimeout } from "node:timers/promises";
import { terminalUi } from "../../shared/terminal.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { startRunSession } from "./start-run-session.js";
import {
  readSession,
  resumableSession,
  saveSessionFile,
  sessionFile,
  stoppedSession,
  workerAlive,
} from "./run-session.repository.js";
import { closeSessionView, refreshSessionView } from "./run-session-view.js";
import type { SessionView } from "./execution.types.js";
import { detachSession, sessionInterrupts } from "./run-session-interrupt.js";
import { loadConfig } from "../../config/index.js";

type RunSessionInput = TaskSelection & {
  cwd: string;
  tasksPath?: string;
  background?: boolean;
  resumeOnly?: boolean;
  trustPlugins?: boolean;
};

export async function runSession(input: RunSessionInput): Promise<boolean> {
  const previous = await resumableSession(input.cwd);
  if (!previous && input.resumeOnly) return false;
  const background =
    input.background ?? (!previous && (await loadConfig(input.cwd)).config?.execution?.background);
  const session =
    previous ?? (await startRunSession(input.cwd, input.tasksPath ?? "plan.md", input));
  const state: SessionView = {
    cwd: input.cwd,
    session,
    ui: terminalUi(new AbortController().signal),
    detached: false,
    closed: false,
    lines: new Map(),
  };
  const cleanup = sessionInterrupts(state);
  try {
    if (background && session.status === "running") await detachSession(state);
    else await followSession(state, Boolean(previous && previous.status !== "running"));
  } finally {
    state.closed = true;
    closeSessionView(state);
    cleanup();
  }
  return true;
}

async function followSession(state: SessionView, finished: boolean): Promise<void> {
  while (!state.detached) {
    const session = await readSession(state.cwd);
    if (!session || session.id !== state.session.id) throw stoppedSession();
    state.session = session;
    await refreshSessionView(state);
    if (state.error) throw state.error;
    const keepOpen =
      finished || (session.status !== "cancelled" && Boolean(state.report?.finishedAt));
    if (
      session.status !== "running" &&
      !state.choosing &&
      (!keepOpen || !state.view || state.closed)
    )
      break;
    if (
      session.status === "running" &&
      !workerAlive(session) &&
      (await readSession(state.cwd))?.status === "running"
    )
      throw stoppedSession();
    await setTimeout(100);
  }
  if (state.detached) return;
  closeSessionView(state);
  if ((await sessionFile(state.cwd, "background")) === state.session.id)
    await saveSessionFile(state.cwd, "background", "");
  finishSession(state);
}

function finishSession(state: SessionView): void {
  if (state.session.status === "cancelled") throw new CancelError();
  if (state.session.status === "failed")
    throw new UserError(
      state.session.error ?? "Execution failed.",
      state.session.nextAction ?? "Run maestrun run --status.",
    );
  const tasks =
    state.report?.tasks.filter(
      (task) => !state.report?.selectedTaskIds || state.report.selectedTaskIds.includes(task.id),
    ) ?? [];
  const total = tasks.length;
  state.ui.log("Run report saved: .maestrun/run.json");
  state.ui.log(`Completed ${total}/${total} tasks.`);
}
