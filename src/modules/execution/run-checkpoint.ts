import { createHash } from "node:crypto";
import { join } from "node:path";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Task } from "../../contracts/tasks.js";
import { isRecord, type Config } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { initialTaskState } from "./scheduler.js";
import { uniqueWorktrees, validWorktree } from "./task-worktree.js";
import { validReruns } from "./task-reruns.js";
import { validUsageRecord } from "../../shared/token-usage.js";
function invalid(message: string): never {
  throw new UserError(
    `Cannot resume saved progress: ${message}.`,
    "Preserve .maestrun/run.json. Restore the matching task plan/workflow or repair the saved report before retrying. Use a new task ID for different work.",
  );
}
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
    (value.definition !== undefined && typeof value.definition !== "string") ||
    (value.integration !== undefined && !["pending", "running"].includes(String(value.integration)))
  )
    invalid("invalid task record");
  if (value.steps !== undefined) validateSteps(value);
  if (!validUsageRecord(value)) invalid("invalid token usage");
  if (!validWorktree(value.worktree)) invalid("invalid task worktree");
  if (value.reruns !== undefined && !validReruns(value.reruns)) invalid("invalid rerun history");
  if (value.status === "completed" && value.completedSteps !== value.totalSteps)
    invalid("incomplete counters");
  for (const step of (value as TaskState).steps ?? [])
    if (!step.tokenUsage && step.status !== "pending") step.tokenUsageIncomplete = true;
  return value as TaskState;
}
function validateSteps(value: Record<string, unknown>): void {
  if (!Array.isArray(value.steps) || value.steps.length !== value.totalSteps)
    invalid(`invalid step history for ${String(value.id)}`);
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
      invalid(`inconsistent step history for ${String(value.id)}`);
    ids.add(step.id);
  }
}
async function readCheckpoint(cwd: string): Promise<readonly TaskState[]> {
  const saved = await snapshotFile(join(cwd, ".maestrun/run.json"));
  if (!saved.exists) return [];
  let value: unknown;
  try {
    value = JSON.parse(saved.content);
  } catch {
    return invalid("invalid report JSON");
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.tasks) ||
    !value.tasks.length ||
    (value.archivedTasks !== undefined && !Array.isArray(value.archivedTasks))
  )
    return invalid("invalid run report");
  const tasks = [...value.tasks, ...(value.archivedTasks ?? [])].map(savedTask);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length || !uniqueWorktrees(tasks))
    invalid("duplicate task IDs or worktrees");
  return tasks;
}
function checkMatch(current: TaskState, previous: TaskState): void {
  if (
    previous.definition
      ? previous.definition !== current.definition
      : previous.title !== current.title
  )
    invalid(`task ${current.id} changed since the saved run`);
  if (
    previous.totalSteps !== current.totalSteps ||
    previous.steps?.some((step, i) => step.id !== current.steps?.[i]?.id)
  )
    invalid(`workflow stages changed for task ${current.id}`);
}
function restoreTask(current: TaskState, previous: TaskState | undefined): TaskState {
  if (!previous) return current;
  if (!current.integration && !previous.worktree) delete previous.integration;
  checkMatch(current, previous);
  const pendingIntegration = previous.worktree && !previous.worktree.integrated;
  const completed = previous.completedSteps === previous.totalSteps && !pendingIntegration;
  const restored = {
    ...previous,
    ...current,
    completedSteps: previous.completedSteps,
    status: completed ? ("completed" as const) : ("pending" as const),
    steps: (current.steps ?? []).map((step, i) =>
      i < previous.completedSteps
        ? { ...(previous.steps?.[i] ?? step), status: "completed" as const }
        : { ...previous.steps?.[i], ...step },
    ),
  };
  if (!previous.tokenUsage && previous.completedSteps > 0) restored.tokenUsageIncomplete = true;
  if (restored.status === "completed" || typeof restored.error !== "string") delete restored.error;
  if (restored.status !== "completed") {
    delete restored.conversationId;
    delete restored.conversation;
  }
  return restored;
}
export async function resumeReport(
  cwd: string,
  config: Config,
  tasks: readonly Task[],
): Promise<RunReport> {
  const previous = await readCheckpoint(cwd);
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
      ),
    ),
  };
}
