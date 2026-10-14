import { restoreTask } from "./restore-task.js";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Task } from "../../contracts/tasks.js";
import { isRecord, type Config } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import { invalidCheckpoint } from "./checkpoint-error.js";
import { initialTaskState } from "./scheduler.js";
import { uniqueWorktrees, validWorktree } from "./task-worktree.js";
import { validReruns } from "./task-reruns.js";
import { validUsageRecord } from "../../shared/token-usage.js";
function savedTask(value: unknown): TaskState {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !["pending", "running", "completed", "failed", "blocked", "cancelled", "refactor"].includes(
      String(value.status),
    ) ||
    !Number.isInteger(value.completedSteps) ||
    !Number.isInteger(value.totalSteps) ||
    typeof value.completedSteps !== "number" ||
    typeof value.totalSteps !== "number" ||
    value.completedSteps < 0 ||
    value.completedSteps > value.totalSteps ||
    value.totalSteps < 1 ||
    (value.status === "completed" && value.completedSteps !== value.totalSteps) ||
    (value.definition !== undefined && typeof value.definition !== "string") ||
    (value.integration !== undefined && !["pending", "running"].includes(String(value.integration)))
  )
    invalidCheckpoint("invalid task record");
  validatePlannedStages(value);
  if (value.steps !== undefined) validateSteps(value);
  if (!validUsageRecord(value)) invalidCheckpoint("invalid token usage");
  if (!validWorktree(value.worktree)) invalidCheckpoint("invalid task worktree");
  if (value.reruns !== undefined && !validReruns(value.reruns))
    invalidCheckpoint("invalid rerun history");
  for (const step of (value as TaskState).steps ?? [])
    if (!step.tokenUsage && step.status !== "pending") step.tokenUsageIncomplete = true;
  return value as TaskState;
}
function validatePlannedStages(value: Record<string, unknown>): void {
  if (
    value.plannedStages !== undefined &&
    (!Array.isArray(value.plannedStages) ||
      !value.plannedStages.length ||
      !value.plannedStages.every((id) => typeof id === "string") ||
      new Set(value.plannedStages).size !== value.plannedStages.length ||
      value.completedSteps !== value.totalSteps)
  )
    invalidCheckpoint("invalid replanned stages");
}

function validateSteps(value: Record<string, unknown>): void {
  if (!Array.isArray(value.steps) || value.steps.length !== value.totalSteps)
    invalidCheckpoint(`invalid step history for ${String(value.id)}`);
  const ids = new Set<string>();
  for (const [index, step] of value.steps.entries()) {
    if (
      !isRecord(step) ||
      typeof step.id !== "string" ||
      typeof step.title !== "string" ||
      !validUsageRecord(step) ||
      ids.has(step.id) ||
      !["pending", "running", "completed", "failed", "refactor", "cancelled"].includes(
        String(step.status),
      ) ||
      (step.status === "completed") !== index < Number(value.completedSteps)
    )
      invalidCheckpoint(`inconsistent step history for ${String(value.id)}`);
    ids.add(step.id);
  }
}
export async function readCheckpoint(cwd: string): Promise<readonly TaskState[]> {
  const saved = await snapshotFile(join(cwd, ".maestrun/run.json"));
  if (!saved.exists) return [];
  let value: unknown;
  try {
    value = JSON.parse(saved.content);
  } catch {
    return invalidCheckpoint("invalid report JSON");
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.tasks) ||
    !value.tasks.length ||
    (value.archivedTasks !== undefined && !Array.isArray(value.archivedTasks))
  )
    return invalidCheckpoint("invalid run report");
  const tasks = [...value.tasks, ...(value.archivedTasks ?? [])].map(savedTask);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length || !uniqueWorktrees(tasks))
    invalidCheckpoint("duplicate task IDs or worktrees");
  return tasks;
}
export async function resumeReport(
  cwd: string,
  config: Config,
  tasks: readonly Task[],
): Promise<RunReport> {
  const previous = await readCheckpoint(cwd);
  return buildReport(config, tasks, { previous });
}

export function buildReport(
  config: Config,
  tasks: readonly Task[],
  options: { previous: readonly TaskState[]; replan?: boolean },
): RunReport {
  const { previous } = options;
  const archivedTasks = previous.filter((entry) => !tasks.some((task) => task.id === entry.id));
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    ...(archivedTasks.length ? { archivedTasks } : {}),
    tasks: tasks.map((task) =>
      restoreTask(
        {
          ...initialTaskState(config, task),
          definition: createHash("sha256")
            .update(JSON.stringify({ ...task, dependsOn: [...task.dependsOn].sort() }))
            .digest("hex"),
        },
        previous.find((entry) => entry.id === task.id),
        options.replan,
      ),
    ),
  };
}
