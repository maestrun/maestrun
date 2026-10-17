import type { Task } from "../../contracts/tasks.js";
import { executorLabel, stageLabel } from "../../contracts/workflow.js";
import type { Config, Draft } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { UserError } from "../../shared/errors.js";
import { cleanText } from "../../shared/terminal-text.js";
import {
  parseTaskDocument,
  resolveTaskAgents,
  saveOrchestrationConfig,
  taskStages,
} from "../execution/index.js";
import { advancedDocuments } from "./advanced-plan.js";

export async function validateOrchestratorPlan(
  cwd: string,
  draft: Draft,
  content: string,
): Promise<readonly Task[]> {
  const markdown = draft.planMode === "advanced" ? (advancedDocuments(content)[2] ?? "") : content;
  const tasks = parseTaskDocument(
    markdown.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/u, "$1"),
  );
  if (!draft.config.execution?.orchestrator) return tasks;
  for (const task of tasks) {
    if (!task.steps)
      throw new UserError(
        `Task ${task.id} is missing its Steps metadata.`,
        "Generate a plan with explicit steps for every task, then review plan.md before running.",
      );
  }
  const resolved = await resolveTaskAgents(cwd, draft.config, tasks);
  for (const task of resolved) taskStages(draft.config, task);
  return resolved;
}

export async function reviewTaskPlan(
  input: CommandInput,
  config: Config,
  tasks: readonly Task[],
): Promise<void> {
  const resolved = await resolveTaskAgents(input.cwd, config, tasks);
  if (resolved.every((task) => task.steps || config.stages.length > 1))
    await saveOrchestrationConfig(input.cwd, config, resolved);
  input.ui.log("Final plan review — task steps");
  for (const task of resolved) reviewTask(input, config, task);
  input.ui.log(
    "Review and edit each task's Steps and instructions in plan.md (or its linked task files) before execution.",
  );
  input.ui.log(
    "After editing, use maestrun run --dry-run to preview the final steps, then maestrun run to execute.",
  );
}

function reviewTask(input: CommandInput, config: Config, task: Task): void {
  input.ui.log(cleanText(`${task.id}: ${task.title}`));
  if (!task.steps && config.stages.length === 1) {
    input.ui.log(
      "  Steps not defined — add - Steps: custom:Name and step instructions in the plan before running.",
    );
    return;
  }
  for (const stage of taskStages(config, task))
    input.ui.log(
      cleanText(
        `  ${stageLabel(stage.id)} — ${executorLabel(stage.executor)} / ${stage.model} / effort: ${stage.effort ?? "default"}`,
      ),
    );
}
