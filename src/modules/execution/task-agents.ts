import { createHash } from "node:crypto";
import type { Config, Stage } from "../../contracts/workflow.js";
import { isExecutor, validEffort, validModel } from "../../contracts/workflow.js";
import type { Task } from "../../contracts/tasks.js";
import { readRequirements } from "../../shared/requirements.js";
import { UserError } from "../../shared/errors.js";
import { taskStages } from "./tasks.js";

export function taskDefinition(task: Task): Task {
  const definition = { ...task };
  delete definition.agentAssignments;
  return definition;
}

export function taskFingerprint(task: Task): string {
  return createHash("sha256")
    .update(JSON.stringify({ ...taskDefinition(task), dependsOn: [...task.dependsOn].sort() }))
    .digest("hex");
}

function invalidAgent(path: string, field: string): never {
  throw new UserError(
    `Invalid ${field} in agent file ${path}.`,
    "Use scalar model, executor and effort fields in Markdown YAML frontmatter.",
  );
}

function agentFields(text: string, path: string): Map<string, string> {
  const fields = new Map<string, string>();
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return fields;
  const header = /^---\n([\s\S]*?)\n(?:---|\.\.\.)(?:\n|$)/u.exec(normalized);
  if (!header) return invalidAgent(path, "frontmatter");
  for (const line of (header[1] ?? "").split("\n")) {
    const match =
      /^(model|executor|effort|reasoning_effort|model_reasoning_effort):\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const key = match[1]?.endsWith("effort") ? "effort" : (match[1] ?? "");
    const scalar = /^(?:"([^"\n]*)"|'([^'\n]*)'|([^\s#"']+))(?:\s+#.*)?$/u.exec(match[2] ?? "");
    if (!scalar || fields.has(key)) return invalidAgent(path, key);
    fields.set(key, scalar[1] ?? scalar[2] ?? scalar[3] ?? "");
  }
  return fields;
}

function agentStage(stage: Stage, path: string, text: string): Stage {
  const fields = agentFields(text, path);
  const model = fields.get("model");
  const selected = model !== undefined && model !== "inherit" ? model : stage.model;
  if (!validModel(selected)) return invalidAgent(path, "model");
  const executor = fields.get("executor") ?? modelExecutor(model) ?? stage.executor;
  if (!isExecutor(executor) || (executor === "copilot" && selected === "auto"))
    return invalidAgent(path, "executor/model");
  const effort =
    fields.get("effort") ?? (validEffort(stage.effort, executor) ? stage.effort : undefined);
  if (effort !== undefined && !validEffort(effort, executor)) return invalidAgent(path, "effort");
  return {
    id: stage.id,
    executor,
    model: selected,
    agent: path,
    ...(effort ? { effort } : {}),
    ...(stage.file ? { file: stage.file } : {}),
  };
}

function modelExecutor(model: string | undefined): Stage["executor"] | undefined {
  if (!model || model === "inherit") return undefined;
  if (/^(?:claude-|opus(?:-|$)|sonnet(?:-|$)|haiku(?:-|$))/u.test(model)) return "claude";
  if (/^(?:gpt-|o\d(?:-|$)|codex-)/u.test(model)) return "codex";
  if (/^grok-/u.test(model)) return "grok";
  return undefined;
}

export async function resolveTaskAgents(
  cwd: string,
  config: Config,
  tasks: readonly Task[],
): Promise<readonly Task[]> {
  const files = new Map<string, string>();
  const resolved: Task[] = [];
  for (const task of tasks) {
    if (!task.agents) {
      resolved.push(task);
      continue;
    }
    if (!config.execution?.orchestrator)
      throw new UserError(
        "Agent bindings require orchestration.",
        "Enable execution.orchestrator.",
      );
    resolved.push(await resolveAgents({ cwd, config, files }, task));
  }
  return resolved;
}

async function resolveAgents(
  context: { cwd: string; config: Config; files: Map<string, string> },
  task: Task,
): Promise<Task> {
  const unassigned = { ...task };
  delete unassigned.agents;
  const agentAssignments: Partial<Record<Stage["id"], Stage>> = {};
  for (const stage of taskStages(context.config, unassigned)) {
    const path = task.agents?.[stage.id];
    if (!path) continue;
    let text = context.files.get(path);
    if (text === undefined) {
      text = (await readRequirements(context.cwd, path)).text;
      context.files.set(path, text);
    }
    agentAssignments[stage.id] = agentStage(stage, path, text);
  }
  return { ...task, agentAssignments };
}
