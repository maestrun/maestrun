import chalk from "chalk";
import stringWidth from "string-width";
import type { RunReport, TaskState, TaskStep } from "../../contracts/run.js";
import type { ViewState } from "./run-view-state.js";
import { visibleTasks, selectedIndex } from "./run-view-state.js";
import { taskTable, panelSizes, joinPanels } from "./run-layout.js";
import { DEFAULT_LAYOUT } from "../../contracts/layout.js";
import { cell, cleanText } from "../../shared/terminal-text.js";
import { tokenUsageLabel } from "../../shared/token-usage.js";

import { taskDisplaySteps } from "./task-display-steps.js";
import { holdColor } from "./task-input-view.js";
import { orchestrationFlowchart } from "./orchestration-flowchart.js";

const STEP_HEIGHT = 7;

const COLORS = {
  pending: chalk.white,
  running: chalk.green,
  completed: chalk.blue,
  failed: chalk.red,
  refactor: chalk.yellow,
  cancelled: chalk.gray,
  on_hold: holdColor,
};
const LABELS = {
  pending: "Waiting",
  running: "In progress",
  completed: "Done",
  failed: "Error",
  refactor: "Refactor · needs changes",
  cancelled: "Cancelled",
  on_hold: "On hold · awaiting input",
};

export function taskFlowchart(
  task: TaskState | undefined,
  size: { width: number; height: number },
  selected?: string,
): string[] {
  const lines = [chalk.bold(cell("  [ Flow ]  PgUp/PgDn", size.width))];
  if (!task) return [...lines, cell("No task selected.", size.width)];
  lines.push(cell(`  ${task.id} · ${task.title}`, size.width));
  const steps = taskDisplaySteps(task);
  if (!steps.length) return [...lines, cell("Step history unavailable.", size.width)];
  const capacity = Math.max(1, Math.floor((size.height - 3) / STEP_HEIGHT));
  const current = Math.max(
    0,
    steps.findIndex((step) => step.id === (selected ?? task.step)),
  );
  const start = Math.min(
    Math.max(0, current - Math.min(1, capacity - 1)),
    Math.max(0, steps.length - capacity),
  );
  lines.push(cell(start ? `  ↑ ${start} earlier steps` : "", size.width));
  lines.push(
    ...stepDiagram(steps, size.width, selected).slice(
      start * STEP_HEIGHT,
      (start + capacity) * STEP_HEIGHT - 1,
    ),
  );
  const remaining = steps.length - start - capacity;
  if (remaining > 0) lines.push(cell(`  ↓ ${remaining} later steps`, size.width));
  return lines.slice(0, size.height);
}

function stepDiagram(steps: TaskStep[], width: number, selected?: string): string[] {
  const implementation = steps.findIndex((step) => step.id === "implementation");
  const repair = steps.findIndex((step) => step.status === "refactor");
  const returning = implementation >= 0 && repair > implementation;
  const nodeWidth = width - (returning ? 4 : 0);
  const lines = steps.flatMap((step, index) => [
    ...(index ? [chalk.dim(cell("       ↓", nodeWidth))] : []),
    ...node(step, nodeWidth, step.id === selected),
  ]);
  if (!returning) return lines;
  const destination = implementation * STEP_HEIGHT + 1;
  const source = repair * STEP_HEIGHT + 1;
  return lines.map((line, index) => {
    if (index === destination) return chalk.yellow(" ┌──▶") + line.slice(1);
    if (index === source) return chalk.yellow(" └───") + line.slice(1);
    return (index > destination && index < source ? chalk.yellow(" │  ") : "    ") + line;
  });
}

function node(step: TaskStep, width: number, selected: boolean): string[] {
  const inner = Math.max(1, width - 4);
  const color = COLORS[step.status];
  return [
    ` ${color(`┌${"─".repeat(inner)}┐`)}`,
    ` ${color("│")}${selected ? chalk.inverse.bold(cell(`› ${step.title}`, inner)) : cell(step.title, inner)}${color("│")}`,
    ` ${color("│")}${cell(LABELS[step.status], inner)}${color("│")}`,
    ` ${color("│")}${cell(step.id === "integration" ? "Git · local" : `${step.model ?? "—"} · ${step.effort ?? "default"}`, inner)}${color("│")}`,
    ` ${color("│")}${cell(tokenUsageLabel(step), inner)}${color("│")}`,
    ` ${color(`└${"─".repeat(inner)}┘`)}`,
  ];
}

function flowWidth(task: TaskState | undefined): number {
  const labels = [
    "[ Flow ]  PgUp/PgDn",
    ...Object.values(LABELS),
    ...taskDisplaySteps(task).flatMap((step) => [
      `› ${step.title}`,
      step.id === "integration"
        ? "Git · local"
        : `${step.model ?? "—"} · ${step.effort ?? "default"}`,
      tokenUsageLabel(step),
    ]),
  ];
  return Math.max(...labels.map((label) => stringWidth(cleanText(label)))) + 8;
}

export function executionBody(
  report: RunReport,
  state: ViewState,
  size: { width: number; height: number },
): string[] {
  const tasks = visibleTasks(report, state.filter);
  const task = tasks[selectedIndex(tasks, state)];
  const flow = state.layout?.flowchart ?? DEFAULT_LAYOUT.flowchart;
  if (report.orchestration && !state.details)
    return state.flow
      ? orchestrationFlowchart(report, state, size)
      : taskTable(report, state, size);
  const sizes = panelSizes(size, flow, flowWidth(task));
  if (state.flow && state.flowStep && !state.details && !sizes)
    return taskFlowchart(task, size, state.flowStep);
  if (!state.flow || state.details || !sizes) return taskTable(report, state, size);
  const panels = [
    { lines: taskTable(report, state, sizes.table), size: sizes.table },
    { lines: taskFlowchart(task, sizes.chart, state.flowStep), size: sizes.chart },
  ];
  if (flow.position === "left" || flow.position === "top") panels.reverse();
  return joinPanels(panels, sizes.stacked);
}
