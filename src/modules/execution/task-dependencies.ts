import type { Task } from "../../contracts/tasks.js";

export function taskDependencies(tasks: readonly Task[], task: Task): readonly string[] {
  return [
    ...new Set([
      ...task.dependsOn,
      ...tasks.filter((entry) => entry.repairFor === task.id).map((entry) => entry.id),
    ]),
  ];
}
