import stringWidth from "string-width";
import type { TaskState } from "../../contracts/run.js";
import { orchestrationGraph } from "./orchestration-graph.js";
import { graphConnections } from "./orchestration-graph-edges.js";
import {
  orchestrationFlowNode,
  type FlowLayout,
  type FlowNode,
} from "./orchestration-flow-node.js";

export function orchestrationGraphLayout(
  tasks: TaskState[],
  detailed: boolean,
  vertical: boolean,
): FlowLayout {
  const { edges, levels } = orchestrationGraph(tasks);
  const nodes = tasks.map((task) =>
    graphNode(task, levels.get(task.id) ?? 0, { detailed, vertical }),
  );
  const gutter = edges.reduce(
    (size, edge, index) =>
      (levels.get(edge.to) ?? 0) > (levels.get(edge.from) ?? 0) + 1 ? index + 3 : size,
    0,
  );
  const size = placeLayers(nodes, vertical, gutter);
  const parts = graphConnections(nodes, edges, vertical);
  parts.push(
    ...nodes.flatMap((node) =>
      node.lines.map((text, row) => ({
        x: node.x,
        y: node.y + row,
        text,
        node,
      })),
    ),
  );
  return { nodes, parts, ...size, edges };
}

function graphNode(
  task: TaskState,
  depth: number,
  options: { detailed: boolean; vertical: boolean },
): FlowNode {
  const lines = orchestrationFlowNode(task, options.detailed, options.vertical);
  return {
    task,
    lines,
    children: [],
    depth,
    width: stringWidth(lines[0] ?? ""),
    height: lines.length,
    x: 0,
    y: 0,
  };
}

function placeLayers(
  nodes: FlowNode[],
  vertical: boolean,
  gutter: number,
): { width: number; height: number } {
  let offset = 0,
    span = 0;
  for (let level = 0; level <= Math.max(-1, ...nodes.map((node) => node.depth)); level++) {
    const layer = nodes.filter((node) => node.depth === level);
    let cross = gutter;
    for (const node of layer) {
      node.x = vertical ? cross : offset;
      node.y = vertical ? offset : cross;
      cross += (vertical ? node.width : node.height) + 3;
    }
    span = Math.max(span, cross - 3);
    const next = nodes.filter((node) => node.depth === level + 1).length;
    offset +=
      Math.max(0, ...layer.map((node) => (vertical ? node.height : node.width))) +
      (next ? 8 + 2 * (layer.length + next) : 8);
  }
  return vertical
    ? { width: span, height: Math.max(0, offset - 8) }
    : { width: Math.max(0, offset - 8), height: span };
}
