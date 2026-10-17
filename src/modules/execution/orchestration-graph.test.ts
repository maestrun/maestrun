import { expect, test } from "vitest";
import type { TaskState } from "../../contracts/run.js";
import { orchestrationFlowLayout } from "./orchestration-flow-layout.js";
import { orchestrationGraph } from "./orchestration-graph.js";
import { treeTasks } from "./task-tree.js";

function fixture(): TaskState[] {
  return [
    { id: "main" },
    { id: "a", parentId: "main", dependsOn: [] },
    { id: "b", parentId: "main", dependsOn: [] },
    { id: "join", parentId: "a", dependsOn: ["a", "b"] },
    { id: "finish", parentId: "join", dependsOn: ["a", "join"] },
  ].map((task, i) => ({
    ...task,
    title: task.id,
    status: "pending",
    completedSteps: 0,
    totalSteps: i + 1,
    steps: Array.from({ length: i + 1 }, (_, n) => ({
      id: `custom:${n}`,
      title: `Step ${n}`,
      status: "pending",
    })),
  }));
}

test.for([false, true])(
  "draws every edge once without duplicating nodes or crossing cards, detailed=%s",
  (detailed) => {
    for (const direction of ["horizontal", "vertical"] as const) {
      const layout = orchestrationFlowLayout(fixture().reverse(), detailed, direction);
      expect(layout.nodes).toHaveLength(5);
      expect(layout.edges).toHaveLength(6);
      expect(layout.edges).toEqual(
        expect.arrayContaining([
          { from: "a", to: "join" },
          { from: "b", to: "join" },
          { from: "a", to: "finish" },
        ]),
      );
      checkGeometry(layout, direction);
    }
  },
);

function checkGeometry(
  layout: ReturnType<typeof orchestrationFlowLayout>,
  direction: string,
): void {
  for (const edge of layout.edges ?? []) {
    const from = layout.nodes.find((node) => node.task.id === edge.from);
    const to = layout.nodes.find((node) => node.task.id === edge.to);
    if (!from || !to) throw new Error("Missing node");
    expect(
      direction === "vertical" ? to.y > from.y + from.height : to.x > from.x + from.width,
    ).toBe(true);
  }
  for (const part of layout.parts.filter((part) => !part.node)) {
    expect(part.x).toBeGreaterThanOrEqual(0);
    expect(part.y).toBeGreaterThanOrEqual(0);
    expect(part.x).toBeLessThan(layout.width);
    expect(part.y).toBeLessThan(layout.height);
    expect(
      layout.nodes.some(
        (node) =>
          part.x >= node.x &&
          part.x < node.x + node.width &&
          part.y >= node.y &&
          part.y < node.y + node.height,
      ),
    ).toBe(false);
  }
}

test("filters retain all prerequisites of a convergence and cycle detection terminates", () => {
  const tasks = fixture();
  const last = tasks.at(-1);
  if (!last) throw new Error("Missing task");
  expect(treeTasks({ version: 1, startedAt: "", tasks }, [last])).toHaveLength(5);
  expect(orchestrationGraph([]).edges).toEqual([]);
  expect(() =>
    orchestrationGraph([
      { ...last, id: "x", dependsOn: ["y"] },
      { ...last, id: "y", dependsOn: ["x"] },
    ]),
  ).toThrow("Cyclic");
});
