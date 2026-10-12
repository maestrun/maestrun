import { terminalUi } from "../../shared/terminal.js";
import { isCancellation, UserError } from "../../shared/errors.js";
import { runWorkflow } from "./run-workflow.js";
import { releaseSession, saveSessionFile, sessionFile } from "./run-session.repository.js";
import type { RunSession } from "./run-session.repository.js";

export async function runSessionWorker(
  id: string,
  tasksPath: string,
  trustPlugins = false,
): Promise<void> {
  const cwd = process.cwd();
  const controller = new AbortController();
  const session: RunSession = {
    id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  const abort = (): void => controller.abort();
  process.on("SIGTERM", abort);
  process.on("SIGINT", abort);
  const timer = watchCancellation(cwd, id, controller);
  try {
    await saveSessionFile(cwd, "session.json", JSON.stringify(session));
    process.send?.({ ready: true });
    if (process.connected) process.disconnect?.();
    await performRun(cwd, tasksPath, { session, controller, trustPlugins });
    await saveSessionFile(cwd, "session.json", JSON.stringify(session));
  } finally {
    clearInterval(timer);
    process.removeListener("SIGTERM", abort);
    process.removeListener("SIGINT", abort);
    await releaseSession(cwd);
  }
}

async function performRun(
  cwd: string,
  tasksPath: string,
  state: {
    session: RunSession;
    controller: AbortController;
    trustPlugins: boolean;
  },
): Promise<void> {
  try {
    await runWorkflow({
      cwd,
      tasksPath,
      trustPlugins: state.trustPlugins,
      signal: state.controller.signal,
      ui: { ...terminalUi(state.controller.signal), log: () => {}, write: () => {} },
    });
    state.session.status = "completed";
  } catch (error) {
    state.session.status = isCancellation(error) ? "cancelled" : "failed";
    state.session.error =
      error instanceof UserError ? error.message : "The execution worker could not finish the run.";
    state.session.nextAction =
      error instanceof UserError
        ? error.nextAction
        : "Inspect .maestrun/run.log and maestrun run --status.";
  }
}

function watchCancellation(cwd: string, id: string, controller: AbortController): NodeJS.Timeout {
  return setInterval(() => {
    void sessionFile(cwd, "cancel")
      .then((value) => {
        if (value === id) controller.abort();
      })
      .catch(() => controller.abort());
  }, 100);
}
