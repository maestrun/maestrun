import { verticalFlowLayout } from "./orchestration-flow-vertical.js";
import { orchestrationGraphLayout } from "./orchestration-graph-layout.js";
import stringWidth from "string-width";
import type { TaskState } from "../../contracts/run.js";
import {
  orchestrationFlowNode,
  type FlowNode,
  type FlowPart,
  type FlowLayout,
} from "./orchestration-flow-node.js";

export function orchestrationFlowLayout(
  tasks: TaskState[],
  detailed: boolean,
  direction: "horizontal" | "vertical" = "horizontal",
): FlowLayout {
  if (tasks.some((task) => task.dependsOn !== undefined))
    return orchestrationGraphLayout(tasks, detailed, direction === "vertical");
  const nodes: FlowNode[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const roots = tasks.filter((task) => !byId.has(task.parentId ?? ""));
  const vertical = direction === "vertical";
  const trees = roots.map((task) => measure(task, { tasks, nodes, detailed, vertical }, 0));
  if (vertical) return verticalFlowLayout(nodes, trees);
  const widths: number[] = [];
  for (const node of nodes) widths[node.depth] = Math.max(widths[node.depth] ?? 0, node.width);
  const width = Math.max(
    0,
    widths.reduce((sum, value) => sum + value + 6, -6),
  );
  let height = 0;
  for (const tree of trees) {
    place(tree, { widths, width }, height);
    height += tree.height + 2;
  }
  const parts = nodes.flatMap((node) => [
    ...connections(node),
    ...node.lines.map((text, row) => ({ x: node.x, y: node.y + row, text, node })),
  ]);
  return { nodes, parts, width, height: Math.max(0, height - 2) };
}

function measure(
  task: TaskState,
  context: { tasks: TaskState[]; nodes: FlowNode[]; detailed: boolean; vertical: boolean },
  depth: number,
): FlowNode {
  const lines = orchestrationFlowNode(task, context.detailed, context.vertical);
  const children = context.tasks
    .filter((child) => child.parentId === task.id)
    .map((child) => measure(child, context, depth + 1));
  const node: FlowNode = {
    task,
    lines,
    children,
    depth,
    width: stringWidth(lines[0] ?? ""),
    height: Math.max(
      lines.length,
      children.reduce((sum, child) => sum + child.height + 2, -2),
    ),
    x: 0,
    y: 0,
  };
  context.nodes.push(node);
  return node;
}

function place(node: FlowNode, size: { widths: number[]; width: number }, top: number): void {
  node.x = size.widths.slice(0, node.depth).reduce((sum, width) => sum + width + 6, 0);
  node.y = top + Math.floor((node.height - node.lines.length) / 2);
  const childrenHeight = node.children.reduce((sum, child) => sum + child.height + 2, -2);
  let childTop = top + Math.floor((node.height - childrenHeight) / 2);
  for (const child of node.children) {
    place(child, size, childTop);
    childTop += child.height + 2;
  }
}

function connections(node: FlowNode): FlowPart[] {
  if (!node.children.length) return [];
  const x = node.x + node.width + 3;
  const center = node.y + 1;
  const rows = new Set(node.children.map((child) => child.y + 1));
  const start = Math.min(center, ...rows);
  const end = Math.max(center, ...rows);
  const parts: FlowPart[] = [{ x: node.x + node.width, y: center, text: "───" }];
  for (let y = start; y <= end; y++) {
    const text = junction({ up: y > start, down: y < end, left: y === center, right: rows.has(y) });
    parts.push({ x, y, text });
  }
  for (const child of node.children)
    parts.push({
      x: x + 1,
      y: child.y + 1,
      text: `${"─".repeat(child.x - x - 2)}▶`,
    });
  return parts;
}

function junction(edges: { up: boolean; down: boolean; left: boolean; right: boolean }): string {
  const key =
    Number(edges.up) * 8 + Number(edges.down) * 4 + Number(edges.left) * 2 + Number(edges.right);
  return (
    [" ", "─", "─", "─", "│", "┌", "┐", "┬", "│", "└", "┘", "┴", "│", "├", "┤", "┼"][key] ?? " "
  );
}
