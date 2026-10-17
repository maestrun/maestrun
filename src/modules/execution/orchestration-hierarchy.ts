import type { TaskState } from "../../contracts/run.js";
import type { Task } from "../../contracts/tasks.js";
import { taskDependencies } from "./task-dependencies.js";

export function orchestrationHierarchy(
  states: TaskState[],
  tasks: readonly Task[],
  root: string,
): void {
  const dependencies = new Map(tasks.map((task) => [task.id, taskDependencies(tasks, task)]));
  const ranks = new Map<string, number>();
  const rank = (id: string): number => {
    if (!ranks.has(id)) ranks.set(id, 1 + Math.max(-1, ...(dependencies.get(id) ?? []).map(rank)));
    return ranks.get(id) ?? 0;
  };
  const parents = new Map(tasks.map((task) => [task.id, task.parentId ?? root]));
  for (const task of [...tasks].sort((a, b) => rank(a.id) - rank(b.id))) {
    if (task.parentId) continue;
    // The navigation tree uses one parent; flowcharts retain all dependency edges.
    const candidates = [...(dependencies.get(task.id) ?? [])].sort((a, b) => rank(b) - rank(a));
    const parent = candidates.find((id) => !createsCycle(parents, task.id, id));
    parents.set(task.id, parent ?? root);
  }
  for (const state of states) {
    const parent = parents.get(state.id);
    if (parent !== undefined) {
      state.parentId = parent;
      state.dependsOn = dependencies.get(state.id) ?? [];
    }
  }
}

function createsCycle(parents: Map<string, string>, task: string, parent: string): boolean {
  let current: string | undefined = parent;
  while (current !== undefined) {
    if (current === task) return true;
    current = parents.get(current);
  }
  return false;
}
