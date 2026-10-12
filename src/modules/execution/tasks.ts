import type { Task } from "../../contracts/tasks.js";
import { isRecord } from "../../contracts/workflow.js";
import type { Config, Stage } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { readRequirements } from "../../shared/requirements.js";
import { dirname, resolve } from "node:path";
import { taskDocumentLinks, markdownTasks } from "./task-markdown.js";

function invalid(message: string): never {
  throw new UserError(
    `Invalid task plan: ${message}.`,
    "Use Markdown task sections in plan.md, or pass --tasks tasks.md. See README for the format.",
  );
}

function parseTask(value: unknown): Task {
  if (!isRecord(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]+$/u.test(value.id))
    return invalid("each task needs a unique alphanumeric id");
  if (typeof value.title !== "string" || !value.title.trim() || /[\p{Cc}]/u.test(value.title))
    return invalid(`${value.id} needs a single-line title`);
  if (typeof value.instructions !== "string" || !value.instructions.trim())
    return invalid(`${value.id} needs instructions and acceptance criteria`);
  if (
    !Array.isArray(value.dependsOn) ||
    !value.dependsOn.every((id): id is string => typeof id === "string")
  )
    return invalid(`${value.id} needs a dependsOn array`);
  if (value.target !== undefined && value.target !== "frontend" && value.target !== "backend")
    return invalid(`${value.id} has an unknown target`);
  return {
    id: value.id,
    title: value.title,
    instructions: value.instructions,
    dependsOn: value.dependsOn,
    ...(value.target ? { target: value.target } : {}),
  };
}

export function parseTasks(value: unknown): readonly Task[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks) || !value.tasks.length)
    return invalid("expected version 1 and a nonempty tasks array");
  const tasks = value.tasks.map(parseTask);
  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length) return invalid("duplicate task ids");
  for (const task of tasks)
    if (task.dependsOn.some((id) => !ids.has(id) || id === task.id))
      return invalid(`${task.id} has an unknown or self dependency`);
  const resolved = new Set<string>();
  while (resolved.size < tasks.length) {
    const ready = tasks.filter(
      (task) => !resolved.has(task.id) && task.dependsOn.every((id) => resolved.has(id)),
    );
    if (!ready.length) return invalid("cyclic dependencies");
    for (const task of ready) resolved.add(task.id);
  }
  return tasks;
}

export function parseTaskDocument(content: string): readonly Task[] {
  return parseTasks({ version: 1, tasks: readTaskDocument(content) });
}

function readTaskDocument(content: string): readonly Task[] {
  const text = content.replaceAll("\r\n", "\n");
  const tasks = markdownTasks(text);
  const blocks = [...text.matchAll(/```maestrun-tasks\s*\n([\s\S]*?)\n```/gu)];
  if (tasks.length && blocks.length) return invalid("do not mix Markdown tasks and a JSON block");
  if (tasks.length) return tasks;
  if (blocks.length !== 1) return invalid("expected Markdown task sections");
  return parseTaskJson(blocks[0]?.[1] ?? "");
}

function parseTaskJson(text: string): readonly Task[] {
  try {
    return parseTasks(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof UserError) throw error;
    return invalid("malformed JSON");
  }
}

export async function loadTasks(cwd: string, path: string): Promise<readonly Task[]> {
  const visited = new Set<string>();
  const pending = [resolve(cwd, path)];
  const tasks: Task[] = [];
  while (pending.length) {
    const file = pending.shift() ?? "";
    if (visited.has(file)) return invalid("cyclic or repeated task document links");
    visited.add(file);
    const { text } = await readRequirements(cwd, file);
    if (file.endsWith(".json")) {
      tasks.push(...parseTaskJson(text));
      continue;
    }
    const links = taskDocumentLinks(text.replaceAll("\r\n", "\n"));
    if (links.length) pending.unshift(...links.map((link) => resolveTaskLink(file, link)));
    else tasks.push(...readTaskDocument(text));
  }
  return parseTasks({ version: 1, tasks });
}

function resolveTaskLink(file: string, link: string): string {
  try {
    return resolve(dirname(file), decodeURIComponent(link));
  } catch {
    return invalid("invalid task document link");
  }
}

export function taskStages(config: Config, task: Task): readonly Stage[] {
  return config.stages
    .filter((stage) => stage.id !== "planning")
    .map((stage) => {
      const assignment =
        stage.id === "implementation" && task.target
          ? (config.targets?.[task.target] ?? stage)
          : stage;
      return { id: stage.id, ...assignment, ...(stage.file ? { file: stage.file } : {}) };
    });
}
