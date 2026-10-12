import { checkWorktreeRepository } from "./worktree-git.js";
import { loadConfig } from "../../config/index.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { extensionExecutor, extensionProviders, loadExtensions } from "../plugins/index.js";
import { lockRun, reporter } from "./run-report.repository.js";
import type { RunContext } from "./execution.types.js";
import type { RunReport } from "../../contracts/run.js";
import { failureSummary } from "./run-failure.js";
import { schedule } from "./scheduler.js";
import { resumeReport } from "./run-checkpoint.js";
import { executeStep } from "./step-executor.client.js";
import type { Config } from "../../contracts/workflow.js";
import type { Task } from "../../contracts/tasks.js";
import { loadTasks, taskStages } from "./tasks.js";
import type { CommandInput } from "../../shared/command.types.js";

export async function runWorkflow(
  input: CommandInput & { tasksPath?: string; dryRun?: boolean; trustPlugins?: boolean },
  execute: typeof executeStep = executeStep,
): Promise<void> {
  const { config } = await loadConfig(input.cwd);
  if (!config) throw new UserError("No saved workflow was found.", "Run maestrun init first.");
  if (config.stages.length < 2)
    throw new UserError(
      "No execution stages are configured.",
      "Select Implementation, Tests, QA, or custom stages with maestrun init.",
    );
  const tasks = await loadTasks(input.cwd, input.tasksPath ?? "plan.md");
  if (input.dryRun) return previewRun(input, config, tasks);
  await executeRun({ ...input, config, tasks }, execute);
}

async function previewRun(
  input: CommandInput,
  config: Config,
  tasks: readonly Task[],
): Promise<void> {
  const report = await resumeReport(input.cwd, config, tasks);
  if (config.execution?.mode === "parallel") await checkWorktreeRepository(input.cwd);
  for (const task of tasks) {
    const completed = report.tasks.find((entry) => entry.id === task.id)?.completedSteps ?? 0;
    const stages = taskStages(config, task)
      .slice(completed)
      .map((stage) => `${stage.id}: ${stage.executor}/${stage.model}`);
    input.ui.log(
      `${task.id}: ${task.title} | depends on: ${task.dependsOn.join(", ") || "none"} | ${stages.join(" → ") || "Done — skipped"}`,
    );
  }
  input.ui.log(
    `Mode: ${config.execution?.mode ?? "sequential"}; concurrency: ${config.execution?.concurrency ?? 2}`,
  );
}

async function executeRun(
  input: CommandInput & { config: Config; tasks: readonly Task[]; trustPlugins?: boolean },
  execute: typeof executeStep,
): Promise<void> {
  const { config, tasks, cwd, trustPlugins } = input;
  if (input.signal.aborted) throw new CancelError();
  const release = await lockRun(input.cwd);
  try {
    const report = await resumeReport(input.cwd, config, tasks);
    const done = report.tasks.filter((task) => task.status === "completed").length;
    input.ui.log(
      `Saved progress: ${done}/${tasks.length} tasks complete; completed tasks and steps will be skipped.`,
    );
    const extensions =
      done === tasks.length ? [] : await loadExtensions(cwd, config.plugins ?? [], trustPlugins);
    await recordedRun(
      {
        ...input,
        config,
        report,
        providers: extensionProviders(extensions),
        execute: extensionExecutor(extensions, execute),
      },
      tasks,
    );
    finishRun(report, input);
  } finally {
    await release();
  }
}

async function recordedRun(
  context: Omit<RunContext, "update">,
  tasks: readonly Task[],
): Promise<void> {
  const output = reporter(context.cwd, context.report, context.ui);
  try {
    await output.save();
    await schedule({ ...context, update: output.update }, tasks);
    context.report.finishedAt = new Date().toISOString();
    await output.save();
  } finally {
    output.close();
  }
}

function finishRun(report: RunReport, input: CommandInput): void {
  input.ui.log("Run report saved: .maestrun/run.json");
  if (input.signal.aborted || report.tasks.some((task) => task.status === "cancelled"))
    throw new CancelError();
  const completed = report.tasks.filter((task) => task.status === "completed").length;
  if (completed !== report.tasks.length)
    throw new UserError(
      `${completed}/${report.tasks.length} tasks completed.\n${failureSummary(report)}`,
      "View evidence with maestrun run --status and .maestrun/run.log. Adjust settings with maestrun init --advanced, then resume with the same maestrun run --tasks option. Completed work is preserved.",
    );
  input.ui.log(`Completed ${completed}/${report.tasks.length} tasks.`);
}
