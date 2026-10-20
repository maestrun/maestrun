import { parseTasks, invalidTasks } from "./task-validation.js";
export { parseTasks } from "./task-validation.js";
import type { Task } from "../../contracts/tasks.js";
import { isStage, validEffort } from "../../contracts/workflow.js";
import type { Config, Stage, StageId } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { readRequirements } from "../../shared/requirements.js";
import { dirname, resolve } from "node:path";
import { taskDocumentLinks, markdownTasks } from "./task-markdown.js";

export function parseTaskDocument(content: string): readonly Task[] {
  return parseTasks({ version: 1, tasks: readTaskDocument(content) });
}

function readTaskDocument(content: string): readonly Task[] {
  const text = content.replaceAll("\r\n", "\n");
  const tasks = markdownTasks(text);
  const blocks = [...text.matchAll(/```maestrun-tasks\s*\n([\s\S]*?)\n```/gu)];
  if (tasks.length && blocks.length)
    return invalidTasks("do not mix Markdown tasks and a JSON block");
  if (tasks.length) return tasks;
  if (blocks.length !== 1) return invalidTasks("expected Markdown task sections");
  return parseTaskJson(blocks[0]?.[1] ?? "");
}

function parseTaskJson(text: string): readonly Task[] {
  try {
    return parseTasks(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof UserError) throw error;
    return invalidTasks("malformed JSON");
  }
}

export async function loadTasks(cwd: string, path: string): Promise<readonly Task[]> {
  const visited = new Set<string>();
  const pending = [resolve(cwd, path)];
  const tasks: Task[] = [];
  while (pending.length) {
    const file = pending.shift() ?? "";
    if (visited.has(file)) return invalidTasks("cyclic or repeated task document links");
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
    return invalidTasks("invalid task document link");
  }
}

export function taskStages(config: Config, task: Task): readonly Stage[] {
  const stages = task.steps
    ? task.steps.map((id) => resolveTaskStage(config, task, id))
    : config.stages.filter((stage) => stage.id !== "planning");
  if (!stages.length)
    return invalidTasks(`${task.id} needs Steps metadata defining its execution steps`);
  return stages.map((stage) => {
    if (task.agents?.[stage.id]) {
      const assigned = task.agentAssignments?.[stage.id];
      if (!assigned)
        return invalidTasks(`${task.id} has unresolved agent ${task.agents[stage.id]}`);
      return assigned;
    }
    const assignment =
      stage.id === "implementation" && task.target
        ? (config.targets?.[task.target] ?? stage)
        : stage;
    return defaultTaskEffort(config, {
      id: stage.id,
      ...assignment,
      ...(stage.file ? { file: stage.file } : {}),
    });
  });
}

function resolveTaskStage(config: Config, task: Task, id: StageId): Stage {
  if (isStage(id) && id !== "planning") {
    const stage = config.stages.find((entry) => entry.id === id);
    if (stage) return stage;
    const planning = config.stages.find((entry) => entry.id === "planning");
    if (config.execution?.orchestrator && planning) {
      const { executor, model, effort } = planning;
      return { id, executor, model, ...(effort ? { effort } : {}) };
    }
  }
  return invalidTasks(`${task.id} references unconfigured step ${id}`);
}

function defaultTaskEffort(config: Config, stage: Stage): Stage {
  if (!config.execution?.orchestrator || stage.effort) return stage;
  const effort = config.stages.find((entry) => entry.id === "planning")?.effort;
  return validEffort(effort, stage.executor) ? { ...stage, effort } : stage;
}
