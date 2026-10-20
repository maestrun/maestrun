import { selectRunTasks, applyRunSelection } from "./task-selection.js";
import type { TaskSelection } from "./task-selection.js";
import { checkWorkspaceRepositories } from "./workspace-repositories.js";
import { loadConfig } from "../../config/index.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { extensionExecutor, extensionProviders, loadExtensions } from "../plugins/index.js";
import { lockRun, reporter } from "./run-report.repository.js";
import type { RunContext } from "./execution.types.js";
import type { RunReport } from "../../contracts/run.js";
import { failureSummary } from "./run-failure.js";
import { schedule } from "./scheduler.js";
import { orchestrationReport } from "./orchestration-state.js";
import { runOrchestration } from "./orchestration.js";
import { saveOrchestrationConfig } from "./orchestration-config.js";
import { executeStep } from "./step-executor.client.js";
import type { Config } from "../../contracts/workflow.js";
import type { Task } from "../../contracts/tasks.js";
import { loadTasks, taskStages } from "./tasks.js";
import type { CommandInput } from "../../shared/command.types.js";

export async function runWorkflow(
  input: CommandInput &
    TaskSelection & { tasksPath?: string; dryRun?: boolean; trustPlugins?: boolean },
  execute: typeof executeStep = executeStep,
): Promise<void> {
  const { config } = await loadConfig(input.cwd);
  if (!config) throw new UserError("No saved workflow was found.", "Run maestrun init first.");
  if (config.stages.length < 2 && !config.execution?.orchestrator)
    throw new UserError(
      "No execution stages are configured.",
      "Select Implementation, Tests, QA, or custom stages with maestrun init.",
    );
  const tasks = await loadTasks(input.cwd, input.tasksPath ?? "plan.md");
  if (input.dryRun) return previewRun(input, config, tasks);
  await executeRun({ ...input, config, tasks }, execute);
}

async function previewRun(
  input: CommandInput & TaskSelection,
  config: Config,
  tasks: readonly Task[],
): Promise<void> {
  const report = await orchestrationReport(input.cwd, config, tasks);
  if (config.execution?.mode === "parallel") await checkWorkspaceRepositories(input.cwd);
  if (report.orchestration)
    input.ui.log(`Main task · Orchestrator: ${report.orchestration.strategy}`);
  for (const task of selectRunTasks(report.orchestration?.tasks ?? tasks, report, input)) {
    const state = report.tasks.find((entry) => entry.id === task.id);
    const completed = state?.status === "completed" ? Infinity : (state?.completedSteps ?? 0);
    const stages = taskStages(config, task)
      .slice(completed)
      .map((stage) => `${stage.id}: ${stage.executor}/${stage.model}`);
    input.ui.log(
      `${report.orchestration ? "  ├─ " : ""}${task.id}: ${task.title} | depends on: ${task.dependsOn.join(", ") || "none"} | ${stages.join(" → ") || "Done — skipped"}`,
    );
  }
  input.ui.log(
    `Mode: ${config.execution?.mode ?? "sequential"}; concurrency: ${config.execution?.concurrency ?? 2}`,
  );
}

async function executeRun(
  input: CommandInput &
    TaskSelection & { config: Config; tasks: readonly Task[]; trustPlugins?: boolean },
  execute: typeof executeStep,
): Promise<void> {
  const { config, tasks, cwd, trustPlugins } = input;
  if (input.signal.aborted) throw new CancelError();
  const release = await lockRun(input.cwd);
  try {
    const report = await orchestrationReport(input.cwd, config, tasks);
    applyRunSelection(report, tasks, input);
    savedProgress(input, report);
    const extensions = report.tasks.every((task) => task.status === "completed")
      ? []
      : await loadExtensions(cwd, config.plugins ?? [], trustPlugins);
    await recordedRun(
      {
        ...input,
        ...(report.selectedTaskIds ? { selectedTaskIds: report.selectedTaskIds } : {}),
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
  const output = reporter(context.cwd, context.report, {
    ui: context.ui,
    ...(context.tasksPath ? { tasksPath: context.tasksPath } : {}),
  });
  try {
    if (context.report.orchestration)
      await saveOrchestrationConfig(
        context.cwd,
        context.config,
        context.report.orchestration.tasks,
      );
    await output.save();
    if (context.selectedTaskIds)
      await schedule(
        { ...context, update: output.update },
        context.report.orchestration?.tasks ?? tasks,
      );
    else if (context.report.orchestration)
      await runOrchestration({ ...context, update: output.update });
    else await schedule({ ...context, update: output.update }, tasks);
    context.report.finishedAt = new Date().toISOString();
    await output.save();
  } finally {
    output.close();
  }
}

function finishRun(report: RunReport, input: CommandInput): void {
  input.ui.log("Run report saved: .maestrun/run.json");
  const tasks = report.tasks.filter(
    (task) => !report.selectedTaskIds || report.selectedTaskIds.includes(task.id),
  );
  if (input.signal.aborted || tasks.some((task) => task.status === "cancelled"))
    throw new CancelError();
  const completed = tasks.filter((task) => task.status === "completed").length;
  if (completed !== tasks.length)
    throw new UserError(
      `${completed}/${tasks.length} tasks completed.\n${failureSummary({ ...report, tasks })}`,
      "View evidence with maestrun run --status and .maestrun/run.log. Adjust settings with maestrun init --advanced, then resume with the same maestrun run --tasks option. Completed work is preserved.",
    );
  input.ui.log(`Completed ${completed}/${tasks.length} tasks.`);
}

function savedProgress(input: CommandInput, report: RunReport): number {
  const done = report.tasks.filter((task) => task.status === "completed").length;
  input.ui.log(
    `Saved progress: ${done}/${report.tasks.length} tasks complete; completed tasks and steps will be skipped.`,
  );
  return done;
}
