import chalk from "chalk";
import type { LayoutColumn } from "../../contracts/layout.js";
import { row } from "./run-columns.js";
import { isStage, stageLabel } from "../../contracts/workflow.js";
import type { RunReport, TaskState } from "../../contracts/run.js";
import { selectedIndex, visibleTasks } from "./run-view-state.js";
import type { ViewState } from "./run-view-state.js";
import { cell, wrapText } from "../../shared/terminal-text.js";
import { tokenUsageLabel, tokenUsageColumn } from "../../shared/token-usage.js";
import { taskStepOutput } from "./task-step-output.js";

const STATUS = {
  pending: "○ Waiting",
  running: "● Working",
  completed: "✓ Done",
  failed: "! Failed",
  blocked: "! Blocked",
  cancelled: "− Cancelled",
  refactor: "↻ Needs changes",
};
export function stage(task: TaskState): string {
  if (task.status === "completed") return "-";
  return isStage(task.step) ? stageLabel(task.step) : (task.step ?? "—");
}

function taskRow(
  task: TaskState,
  selected: boolean,
  size: { width: number; columns?: readonly LayoutColumn[] },
): string {
  const assignment = taskAssignment(task);
  const text = row(
    [
      `${selected ? "›" : " "} ${task.id}`,
      task.title,
      STATUS[task.status],
      stage(task),
      assignment.model,
      assignment.effort,
      `${task.completedSteps}/${task.totalSteps}`,
      tokenUsageColumn(task),
    ],
    size.width,
    size.columns,
  );
  if (selected) return chalk.inverse.bold(text);
  if (task.status === "failed" || task.status === "blocked") return chalk.red(text);
  if (task.status === "running") return chalk.cyan(text);
  return task.status === "completed" ? chalk.green(text) : chalk.dim(text);
}

function taskList(
  report: RunReport,
  state: ViewState,
  size: { width: number; height: number },
): string[] {
  const tasks = visibleTasks(report, state.filter);
  const index = selectedIndex(tasks, state);
  const blocks = tasks.map((task, i) => taskLines(task, i === index, { ...size, ...state.layout }));
  let start = index;
  let height = blocks[index]?.length ?? 0;
  while (start > 0 && height + (blocks[start - 1]?.length ?? 0) <= size.height) {
    height += blocks[--start]?.length ?? 0;
  }
  const lines = blocks.slice(start).flat();
  if (!tasks.length) lines.push(chalk.dim("  No tasks in this view."));
  return lines.slice(0, size.height);
}

function taskLines(
  task: TaskState,
  selected: boolean,
  size: { width: number; columns?: readonly LayoutColumn[] },
): string[] {
  const { width } = size;
  const assignment = taskAssignment(task);
  return [
    taskRow(task, selected, size),
    ...(!size.columns && width < 50
      ? [chalk.dim(cell(`    ${STATUS[task.status]} · ${assignment.effort}`, width))]
      : []),
    ...(!size.columns && width < 110
      ? [
          chalk.dim(
            cell(
              `    ${width >= 50 && width < 80 ? `${STATUS[task.status]} · ` : ""}${assignment.model}`,
              width,
            ),
          ),
        ]
      : []),
  ];
}

function details(task: TaskState | undefined, width: number, logs: boolean): string[] {
  if (!task) return ["No task selected."];
  return [
    `${task.id} — ${task.title}`,
    `${STATUS[task.status]} · ${task.completedSteps}/${task.totalSteps} steps`,
    `Stage: ${stage(task)}`,
    `Executor: ${task.executor ?? "—"}`,
    `Model: ${task.model ?? "—"} · Effort: ${task.effort ?? "default"}`,
    "",
    ...(task.error ? [`Error: ${task.error}`] : []),
    ...(task.reruns?.flatMap((rerun, index) => [
      "",
      `Rerun ${index + 1}: ${isStage(rerun.fromStep) ? stageLabel(rerun.fromStep) : rerun.fromStep} → Implementation`,
      `Started: ${rerun.startedAt}`,
      `Justification: ${rerun.justification}`,
    ]) ?? []),
    ...taskStepOutput(task, logs),
    "",
    tokenUsageLabel(task),
  ].flatMap((text) =>
    text.split(/\r?\n/u).flatMap((line) => (line ? wrapText(line, width) : [""])),
  );
}

export function taskBody(
  report: RunReport,
  state: ViewState,
  size: { width: number; height: number },
): string[] {
  if (!state.details) return taskList(report, state, size);
  const tasks = visibleTasks(report, state.filter);
  const task = tasks[selectedIndex(tasks, state)];
  const lines = details(task, size.width, Boolean(state.logs));
  const end = Math.max(0, lines.length - size.height);
  state.scroll = state.follow ? end : Math.min(state.scroll, end);
  if (state.follow && state.logs && task?.steps) {
    const current = task.steps.findIndex((step) => step.id === task.step);
    if (current >= 0) {
      const prefix = { ...task, steps: task.steps.slice(0, current + 1) };
      state.scroll = Math.max(0, details(prefix, size.width, true).length - size.height);
    }
  }
  return lines.slice(state.scroll, state.scroll + size.height);
}

function taskAssignment(task: TaskState): { model: string; effort: string } {
  const pending = task.status === "pending" ? task.steps?.[0] : undefined;
  const effort = task.effort ?? pending?.effort ?? "default";
  const model = task.model ?? pending?.model ?? "—";
  return { model, effort };
}
