import { join } from "node:path";
import type { Draft } from "../../contracts/workflow.js";
import type { RunReport } from "../../contracts/run.js";
import type { FileSnapshot } from "../../shared/atomic.js";
import { snapshotFile, atomicWrite } from "../../shared/atomic.js";
import {
  buildReport,
  loadTasks,
  parseTaskDocument,
  readCheckpoint,
  readOrchestration,
  taskChecklist,
} from "../execution/index.js";
import { renderPlan } from "./prompt.js";
import { CancelError, UserError } from "../../shared/errors.js";
import type { CommandInput } from "../../shared/command.types.js";
import { advancedDocuments, saveAdvancedPlan } from "./advanced-plan.js";
import { reviewTaskPlan, validateOrchestratorPlan } from "./task-plan-review.js";

export async function previousPlan(cwd: string, plan: FileSnapshot): Promise<string | undefined> {
  const progress = await readCheckpoint(cwd);
  if (!progress.length) return undefined;
  await checkOrchestratedReplan(cwd);
  const tasks = plan.exists ? await loadTasks(cwd, "plan.md") : [];
  return JSON.stringify({
    tasks,
    progress: progress.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      completedSteps: task.completedSteps,
      totalSteps: task.totalSteps,
      steps: task.steps?.map((step) => ({ id: step.id, status: step.status })),
      worktree: task.worktree ? { integrated: task.worktree.integrated ?? false } : undefined,
    })),
  });
}

export async function validateReplan(
  cwd: string,
  draft: Draft,
  content: string,
): Promise<RunReport | undefined> {
  if (!draft.previousPlan) return undefined;
  await checkOrchestratedReplan(cwd);
  const markdown = draft.planMode === "advanced" ? (advancedDocuments(content)[2] ?? "") : content;
  const tasks = parseTaskDocument(
    markdown.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/u, "$1"),
  );
  return buildReport(draft.config, tasks, { previous: await readCheckpoint(cwd), replan: true });
}

export async function saveReplannedPlan(
  output: { cwd: string; path: string; plan: FileSnapshot },
  content: string,
  report: RunReport | undefined,
): Promise<void> {
  const path = join(output.cwd, ".maestrun/run.json");
  const saved = await snapshotFile(path);
  const updated = report ? `${JSON.stringify(report, null, 2)}\n` : undefined;
  if (updated) await atomicWrite(path, updated, saved);
  try {
    await atomicWrite(output.path, content, output.plan);
  } catch (error) {
    if (updated) await atomicWrite(path, saved.content, { exists: true, content: updated });
    throw error;
  }
}

export async function saveGeneratedPlan(
  input: CommandInput,
  output: { draft: Draft; path: string; plan: FileSnapshot },
  content: string,
): Promise<void> {
  const { draft, path, plan } = output;
  const tasks = await validateOrchestratorPlan(input.cwd, draft, content);
  const report = await validateReplan(input.cwd, draft, content);
  const markdown =
    draft.planMode === "advanced" ? await saveAdvancedPlan(input, draft, content) : content;
  if (input.signal.aborted) throw new CancelError();
  await saveReplannedPlan(
    { cwd: input.cwd, path, plan },
    taskChecklist(renderPlan(draft.config, markdown, draft.guidance), report?.tasks ?? tasks),
    report,
  );
  input.ui.log(`Plan saved: ${path}`);
  if (draft.config.execution?.orchestrator) await reviewTaskPlan(input, draft.config, tasks);
}

async function checkOrchestratedReplan(cwd: string): Promise<void> {
  if (await readOrchestration(cwd))
    throw new UserError(
      "This run has a saved orchestration plan.",
      "Resume with maestrun run. To generate a replacement plan, first finish the run and archive its .maestrun/run.json; keep any retained worktrees needed for recovery.",
    );
}
