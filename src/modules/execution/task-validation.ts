import type { Task } from "../../contracts/tasks.js";
import { isRecord, isStage } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { taskDependencies } from "./task-dependencies.js";

export function invalidTasks(message: string): never {
  throw new UserError(
    `Invalid task plan: ${message}.`,
    "Use Markdown task sections in plan.md, or pass --tasks tasks.md. See README for the format.",
  );
}

function parseTask(value: unknown): Task {
  if (!isRecord(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]+$/u.test(value.id))
    return invalidTasks("each task needs a unique alphanumeric id");
  if (typeof value.title !== "string" || !value.title.trim() || /[\p{Cc}]/u.test(value.title))
    return invalidTasks(`${value.id} needs a single-line title`);
  if (typeof value.instructions !== "string" || !value.instructions.trim())
    return invalidTasks(`${value.id} needs instructions and acceptance criteria`);
  if (
    !Array.isArray(value.dependsOn) ||
    !value.dependsOn.every((id): id is string => typeof id === "string")
  )
    return invalidTasks(`${value.id} needs a dependsOn array`);
  if (value.target !== undefined && value.target !== "frontend" && value.target !== "backend")
    return invalidTasks(`${value.id} has an unknown target`);
  validateSteps(value);
  validateAgents(value);
  return {
    id: value.id,
    title: value.title,
    instructions: value.instructions,
    dependsOn: value.dependsOn,
    ...(value.target ? { target: value.target } : {}),
    ...(value.steps ? { steps: value.steps as NonNullable<Task["steps"]> } : {}),
    ...(value.parentId !== undefined ? { parentId: parentId(value.parentId) } : {}),
    ...(value.repairFor !== undefined ? { repairFor: parentId(value.repairFor) } : {}),
    ...(value.agents !== undefined ? { agents: value.agents as NonNullable<Task["agents"]> } : {}),
  };
}

export function parseTasks(value: unknown): readonly Task[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks) || !value.tasks.length)
    return invalidTasks("expected version 1 and a nonempty tasks array");
  const tasks = value.tasks.map(parseTask);
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) return invalidTasks("duplicate task ids");
  validateParents(tasks);
  for (const task of tasks)
    if (
      (task.repairFor && !ids.has(task.repairFor)) ||
      taskDependencies(tasks, task).some((id) => !ids.has(id) || id === task.id)
    )
      return invalidTasks(`${task.id} has an unknown or self dependency`);
  const resolved = new Set<string>();
  while (resolved.size < tasks.length) {
    const ready = tasks.filter(
      (task) =>
        !resolved.has(task.id) && taskDependencies(tasks, task).every((id) => resolved.has(id)),
    );
    if (!ready.length) return invalidTasks("cyclic dependencies");
    for (const task of ready) resolved.add(task.id);
  }
  return tasks;
}

function parentId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/u.test(value))
    return invalidTasks("Parent or Repairs needs a task id");
  return value;
}

function validateParents(tasks: readonly Task[]): void {
  const parents = new Map(tasks.map((task) => [task.id, task.parentId]));
  for (const task of tasks) {
    const seen = new Set([task.id]);
    let parent = task.parentId;
    while (parent !== undefined) {
      if (!parents.has(parent) || seen.has(parent))
        return invalidTasks("unknown or cyclic task parent");
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
}

function validateSteps(value: Record<string, unknown>): void {
  if (
    value.steps !== undefined &&
    (!Array.isArray(value.steps) ||
      !value.steps.length ||
      !value.steps.every((id) => isStage(id) && id !== "planning") ||
      new Set(value.steps).size !== value.steps.length)
  )
    return invalidTasks(`${value.id} needs a nonempty list of unique execution step ids`);
}

function validateAgents(value: Record<string, unknown>): void {
  if (value.agents === undefined) return;
  if (
    !isRecord(value.agents) ||
    !Object.keys(value.agents).length ||
    Object.entries(value.agents).some(
      ([id, path]) =>
        !Array.isArray(value.steps) ||
        !value.steps.includes(id) ||
        typeof path !== "string" ||
        !path.trim() ||
        path !== path.trim() ||
        /[\p{Cc}]/u.test(path),
    )
  )
    return invalidTasks(`${value.id} needs Agents mapping its Steps to agent file paths`);
}
