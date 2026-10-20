import type { Task } from "../../contracts/tasks.js";
import type { RunReport } from "../../contracts/run.js";
import { UserError } from "../../shared/errors.js";
import { taskDependencies } from "./task-dependencies.js";

export type TaskSelection = { only?: readonly string[]; skip?: readonly string[] };
export type RunSessionOptions = TaskSelection & { trustPlugins?: boolean };

export function selectRunTasks(
  tasks: readonly Task[],
  report: RunReport,
  selection: TaskSelection,
): readonly Task[] {
  if (selection.only === undefined && selection.skip === undefined) return tasks;
  for (const id of [...(selection.only ?? []), ...(selection.skip ?? [])]) {
    if (!tasks.some((task) => task.id === id))
      throw new UserError(
        `Unknown selected task: ${id}.`,
        "Use task IDs from the current plan or use interactive task selection.",
      );
  }
  const selected = tasks.filter(
    (task) =>
      (!selection.only || selection.only.includes(task.id)) && !selection.skip?.includes(task.id),
  );
  if (!selected.length)
    throw new UserError(
      "No tasks selected for this run.",
      "Select at least one task or cancel execution.",
    );
  validateDependencies(tasks, report, selected);
  return selected;
}

function validateDependencies(
  tasks: readonly Task[],
  report: RunReport,
  selected: readonly Task[],
): void {
  const done = new Set(
    report.tasks.filter((task) => task.status === "completed").map((task) => task.id),
  );
  for (const task of selected.filter((task) => !done.has(task.id))) {
    const missing = taskDependencies(tasks, task).filter(
      (id) => !done.has(id) && !selected.some((entry) => entry.id === id),
    );
    if (missing.length)
      throw new UserError(
        `Task ${task.id} needs unfinished dependencies: ${missing.join(", ")}.`,
        "Include these tasks in this run or finish them first. No tasks were started.",
      );
  }
}

export function applyRunSelection(
  report: RunReport,
  tasks: readonly Task[],
  input: TaskSelection,
): void {
  const selected = selectRunTasks(report.orchestration?.tasks ?? tasks, report, input);
  if (input.only !== undefined || input.skip !== undefined)
    report.selectedTaskIds = selected.map((task) => task.id);
}
