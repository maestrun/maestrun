import type { FlowLayout, FlowNode, FlowPart } from "./orchestration-flow-node.js";

export function verticalFlowLayout(nodes: FlowNode[], trees: FlowNode[]): FlowLayout {
  const heights: number[] = [];
  const spans = new Map<FlowNode, number>();
  // Nodes arrive children first, so each subtree's width is already known.
  for (const node of nodes) {
    heights[node.depth] = Math.max(heights[node.depth] ?? 0, node.lines.length);
    spans.set(node, Math.max(node.width, childSpan(node, spans)));
  }
  let left = 0;
  for (const tree of trees) {
    place(tree, left, { heights, spans });
    left += (spans.get(tree) ?? 0) + 4;
  }
  const parts = nodes.flatMap((node) => [
    ...connections(node),
    ...node.lines.map((text, row) => ({ x: node.x, y: node.y + row, text, node })),
  ]);
  return {
    nodes,
    parts,
    width: Math.max(0, left - 4),
    height: Math.max(0, ...nodes.map((node) => node.y + node.lines.length)),
  };
}

function childSpan(node: FlowNode, spans: Map<FlowNode, number>): number {
  return node.children.reduce((sum, child) => sum + (spans.get(child) ?? 0) + 4, -4);
}

function place(
  node: FlowNode,
  left: number,
  size: { heights: number[]; spans: Map<FlowNode, number> },
): void {
  const span = size.spans.get(node) ?? node.width;
  node.x = left + Math.floor((span - node.width) / 2);
  node.y = size.heights.slice(0, node.depth).reduce((sum, height) => sum + height + 3, 0);
  let childLeft = left + Math.floor((span - childSpan(node, size.spans)) / 2);
  for (const child of node.children) {
    place(child, childLeft, size);
    childLeft += (size.spans.get(child) ?? 0) + 4;
  }
}

function connections(node: FlowNode): FlowPart[] {
  const first = node.children[0];
  if (!first) return [];
  const center = node.x + Math.floor(node.width / 2);
  const columns = new Set(node.children.map((child) => child.x + Math.floor(child.width / 2)));
  const start = Math.min(center, ...columns),
    end = Math.max(center, ...columns);
  const branch = first.y - 2;
  const parts: FlowPart[] = [];
  for (let y = node.y + node.lines.length; y < branch; y++) parts.push({ x: center, y, text: "│" });
  for (let x = start; x <= end; x++) {
    const up = x === center,
      down = columns.has(x);
    const text =
      start === end
        ? "│"
        : x === start
          ? "┌"
          : x === end
            ? "┐"
            : (["─", "┬", "┴", "┼"][Number(up) * 2 + Number(down)] ?? "─");
    parts.push({ x, y: branch, text });
  }
  for (const x of columns) parts.push({ x, y: branch + 1, text: "▼" });
  return parts;
}
