import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureStateDirectory, validateStateDirectory } from "../../shared/project-state.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Ui } from "../../shared/ui.types.js";
import { tokenUsageLabel } from "../../shared/token-usage.js";

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
  return `${state.id} (${state.title}) | ${state.status} | ${state.step ?? "—"} | ${state.executor ?? "—"}/${state.model ?? "—"} · effort: ${state.effort ?? "default"} | ${state.completedSteps}/${state.totalSteps} steps${state.error ? ` | ${state.error}` : ""} | ${tokenUsageLabel(state)}`;
}

export function reporter(
  cwd: string,
  report: RunReport,
  ui: Ui,
): {
  save: () => Promise<void>;
  update: (state: TaskState) => Promise<void>;
  close: () => void;
} {
  let pending = Promise.resolve();
  const view = ui.runView?.(report, cwd);
  const path = join(cwd, ".maestrun", "run.json");
  const save = (): Promise<void> => {
    const content = `${JSON.stringify(report, null, 2)}\n`;
    pending = pending.then(async () => {
      await ensureStateDirectory(cwd);
      await atomicWrite(path, content, await snapshotFile(path));
    });
    return pending;
  };
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
