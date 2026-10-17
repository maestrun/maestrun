import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureStateDirectory, validateStateDirectory } from "../../shared/project-state.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Ui } from "../../shared/ui.types.js";
import { pendingInput } from "./task-input.js";
import { cleanText } from "../../shared/terminal-text.js";
import { tokenUsageLabel } from "../../shared/token-usage.js";
import { saveTaskChecklist } from "./task-checklist.js";

export async function lockRun(cwd: string): Promise<() => Promise<void>> {
  await ensureStateDirectory(cwd);
  const path = join(cwd, ".maestrun", "run.lock");
  try {
    await mkdir(path);
  } catch {
    throw new UserError(
      "Could not acquire the run lock.",
      "Wait for the active run. If a previous process crashed, confirm it stopped before removing .maestrun/run.lock; also check directory permissions.",
    );
  }
  return async () => {
    await validateStateDirectory(cwd);
    await rm(path, { recursive: true });
  };
}

export function stateLine(state: TaskState): string {
  return `${state.id} (${state.title}) | ${state.status} | ${state.step ?? "—"} | ${state.executor ?? "—"}/${state.model ?? "—"} · effort: ${state.effort ?? "default"} | ${state.completedSteps}/${state.totalSteps} steps${state.error ? ` | ${state.error}` : ""}${pendingInput(state) ? ` | Awaiting input: ${cleanText(pendingInput(state)?.question ?? "")} · Open maestrun and press H, then I to answer.` : ""} | ${tokenUsageLabel(state)}`;
}

export function reporter(
  cwd: string,
  report: RunReport,
  options: { ui: Ui; tasksPath?: string },
): {
  save: () => Promise<void>;
  update: (state: TaskState) => Promise<void>;
  close: () => void;
} {
  const { ui } = options;
  const view = ui.runView?.(report, cwd);
  const save = reportWriter(cwd, report, options.tasksPath ?? "plan.md");
  return {
    save,
    close: () => view?.close(),
    update: async (state) => {
      if (view) view.update();
      else logProgress(ui, report, state);
      await save();
    },
  };
}

function reportWriter(cwd: string, report: RunReport, tasksPath: string): () => Promise<void> {
  let pending = Promise.resolve();
  const path = join(cwd, ".maestrun", "run.json");
  return (): Promise<void> => {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    const tasks = report.tasks.map(({ id, title, status }) => ({ id, title, status }));
    pending = pending.then(async () => {
      await ensureStateDirectory(cwd);
      await atomicWrite(path, content, await snapshotFile(path));
      await saveTaskChecklist(cwd, tasksPath, tasks);
    });
    return pending;
  };
}

function logProgress(ui: Ui, report: RunReport, state: TaskState): void {
  ui.log(stateLine(state));
  const done = report.tasks.reduce((count, task) => count + task.completedSteps, 0);
  const total = report.tasks.reduce((count, task) => count + task.totalSteps, 0);
  ui.log(`Progress: ${done}/${total} steps (${total ? Math.floor((100 * done) / total) : 0}%)`);
}

export async function showRun(cwd: string): Promise<void> {
  const saved = await snapshotFile(join(cwd, ".maestrun", "run.json"));
  if (!saved.exists) throw new UserError("No run report found.", "Run maestrun run first.");
  console.log(saved.content.trim());
}
