import chalk from "chalk";
import type { RunReport, TaskState } from "../../contracts/run.js";
import { cell } from "../../shared/terminal-text.js";
import { taskDisplaySteps } from "./task-display-steps.js";

export function treeTasks(report: RunReport, matches: TaskState[]): TaskState[] {
  const included = new Set(matches.map((task) => task.id));
  const byId = new Map(report.tasks.map((task) => [task.id, task]));
  const pending = [...matches];
  for (const task of pending) {
    for (const id of [...(task.dependsOn ?? []), ...(task.parentId ? [task.parentId] : [])]) {
      const ancestor = byId.get(id);
      if (!ancestor || included.has(id)) continue;
      included.add(id);
      pending.push(ancestor);
    }
  }
  const result: TaskState[] = [];
  const visit = (task: TaskState): void => {
    if (!included.delete(task.id)) return;
    result.push(task);
    for (const child of report.tasks.filter((entry) => entry.parentId === task.id)) visit(child);
  };
  for (const task of report.tasks.filter((entry) => !entry.parentId || !byId.has(entry.parentId)))
    visit(task);
  return result;
}

type TreeOptions = {
  width: number;
  height: number;
  selected: string;
  treeDetails?: boolean;
  scroll: number;
  state?: { scroll: number };
};

export function taskTree(tasks: TaskState[], options: TreeOptions): string[] {
  const lines: string[] = [];
  let selectedLine = 0;
  for (const task of tasks) {
    const prefix = treePrefix(tasks, task);
    const selected =
      task.id === (tasks.find((entry) => entry.id === options.selected)?.id ?? tasks[0]?.id);
    if (selected) selectedLine = lines.length;
    const line = cell(
      `${selected ? "›" : " "} ${prefix.branch}${task.title}${task.parentId ? ` [${task.id}]` : ""} · ${task.status} · ${task.completedSteps}/${task.totalSteps}`,
      options.width,
    );
    lines.push(selected ? chalk.inverse.bold(line) : line);
    if (task.error) lines.push(chalk.red(cell(`  ${prefix.body}${task.error}`, options.width)));
    const question = task.inputRequests?.find((request) => request.answer === undefined)?.question;
    if (question) lines.push(cell(`  ${prefix.body}On hold: ${question}`, options.width));
    if (options.treeDetails)
      lines.push(
        ...treeSteps(task, prefix.body, {
          width: options.width,
          children: tasks.some((child) => child.parentId === task.id),
        }),
      );
  }
  const start = Math.max(0, Math.min(selectedLine + options.scroll, lines.length - options.height));
  if (options.state) options.state.scroll = start - selectedLine;
  return lines.length ? lines.slice(start, start + options.height) : ["  No tasks in this view."];
}

export function treePrefix(tasks: TaskState[], task: TaskState): { branch: string; body: string } {
  const ancestors: TaskState[] = [];
  const seen = new Set([task.id]);
  let parent = tasks.find((entry) => entry.id === task.parentId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    ancestors.unshift(parent);
    parent = tasks.find((entry) => entry.id === parent?.parentId);
  }
  const last = (entry: TaskState): boolean =>
    tasks.filter((sibling) => sibling.parentId === entry.parentId).at(-1)?.id === entry.id;
  const prefix = ancestors
    .slice(1)
    .map((entry) => (last(entry) ? "   " : "│  "))
    .join("");
  return ancestors.length
    ? {
        branch: `${prefix}${last(task) ? "└─ " : "├─ "}`,
        body: `${prefix}${last(task) ? "   " : "│  "}`,
      }
    : { branch: "", body: "" };
}

function treeSteps(
  task: TaskState,
  prefix: string,
  options: { width: number; children: boolean },
): string[] {
  const steps = taskDisplaySteps(task);
  return steps.map((step, index) =>
    cell(
      `  ${prefix}${index === steps.length - 1 && !options.children ? "└─" : "├─"} ${step.title} · ${step.status}${step.model ? ` · ${step.model}` : ""}`,
      options.width,
    ),
  );
}
