import type { TaskState, TaskStep } from "../../contracts/run.js";
import { cell } from "../../shared/terminal-text.js";
import { taskDisplaySteps } from "./task-display-steps.js";
import type { TaskEdge } from "./orchestration-graph.js";

export type FlowNode = {
  task: TaskState;
  lines: string[];
  children: FlowNode[];
  depth: number;
  width: number;
  height: number;
  x: number;
  y: number;
};
export type FlowPart = { x: number; y: number; text: string; node?: FlowNode };
export type FlowLayout = {
  nodes: FlowNode[];
  parts: FlowPart[];
  width: number;
  height: number;
  edges?: TaskEdge[];
};

export function orchestrationFlowNode(
  task: TaskState,
  detailed: boolean,
  vertical = false,
): string[] {
  const steps = detailed ? taskDisplaySteps(task).map(stepBox) : [];
  const width = Math.max(24, vertical ? 24 : steps.length * 23 - 3 + 2);
  const question = task.inputRequests?.find((request) => request.answer === undefined)?.question;
  const lines = [
    cell(`  ${task.title}${task.parentId ? ` [${task.id}]` : ""}`, width),
    cell(`${task.status} · ${task.completedSteps}/${task.totalSteps} steps`, width),
  ];
  if (question || task.error) lines.push(cell(question ?? task.error ?? "", width));
  if (steps.length) {
    lines.push(" ".repeat(width));
    if (vertical) lines.push(...verticalSteps(steps, width));
    else
      for (let row = 0; row < 5; row++)
        lines.push(
          cell(` ${steps.map((step) => step[row]).join(row === 1 ? "──▶" : "   ")} `, width),
        );
  }
  return [`┌${"─".repeat(width)}┐`, ...lines.map((line) => `│${line}│`), `└${"─".repeat(width)}┘`];
}

function stepBox(step: TaskStep): string[] {
  return [
    `┌${"─".repeat(18)}┐`,
    `│${cell(step.title, 18)}│`,
    `│${cell(step.status, 18)}│`,
    `│${cell(step.id === "integration" ? "Git · local" : `${step.model ?? "—"} · ${step.effort ?? "default"}`, 18)}│`,
    `└${"─".repeat(18)}┘`,
  ];
}

function verticalSteps(steps: string[][], width: number): string[] {
  return steps.flatMap((step, index) => [
    ...(index ? [cell("            │", width), cell("            ▼", width)] : []),
    ...step.map((line) => cell(`  ${line}`, width)),
  ]);
}
