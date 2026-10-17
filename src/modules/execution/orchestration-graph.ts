import type { TaskState } from "../../contracts/run.js";

export type TaskEdge = { from: string; to: string };
export type TaskGraph = { edges: TaskEdge[]; levels: Map<string, number> };

export function orchestrationGraph(tasks: readonly TaskState[]): TaskGraph {
  const ids = new Set(tasks.map((task) => task.id));
  const root = tasks.find((task) => !task.parentId && !task.dependsOn?.length)?.id;
  const edges = tasks.flatMap((task) => {
    const prerequisites = task.dependsOn ?? (task.parentId ? [task.parentId] : []);
    const parents = prerequisites.length ? prerequisites : root && root !== task.id ? [root] : [];
    return [...new Set(parents)]
      .filter((id) => ids.has(id) && id !== task.id)
      .map((from) => ({ from, to: task.id }));
  });
  const levels = new Map<string, number>();
  let pending = [...tasks];
  while (pending.length) {
    const ready = pending.filter((task) =>
      edges.filter((edge) => edge.to === task.id).every((edge) => levels.has(edge.from)),
    );
    if (!ready.length) throw new Error("Cyclic task flow dependencies.");
    for (const task of ready) {
      const incoming = edges.filter((edge) => edge.to === task.id);
      levels.set(task.id, 1 + Math.max(-1, ...incoming.map((edge) => levels.get(edge.from) ?? 0)));
    }
    pending = pending.filter((task) => !levels.has(task.id));
  }
  return { edges, levels };
}
