import type { FlowNode, FlowPart } from "./orchestration-flow-node.js";
import type { TaskEdge } from "./orchestration-graph.js";

type Point = { x: number; y: number };
const GLYPHS = [" ", "─", "─", "─", "│", "┌", "┐", "┬", "│", "└", "┘", "┴", "│", "├", "┤", "┼"];

export function graphConnections(
  nodes: FlowNode[],
  edges: TaskEdge[],
  vertical: boolean,
): FlowPart[] {
  const pixels = new Map<string, { point: Point; mask: number }>();
  const arrows: FlowPart[] = [];
  const byId = new Map(nodes.map((node) => [node.task.id, node]));
  edges.forEach((edge, index) => {
    const from = byId.get(edge.from),
      to = byId.get(edge.to);
    if (!from || !to) return;
    const layer = nodes.filter((node) => node.depth === from.depth);
    const exit =
      Math.max(...layer.map((node) => (vertical ? node.y + node.height : node.x + node.width))) +
      2 +
      layer.indexOf(from) * 2;
    const entry = nodes.filter((node) => node.depth === to.depth).indexOf(to) * 2 + 3;
    const points = route(from, to, { vertical, lane: index + 1, exit, entry });
    for (let i = 1; i < points.length; i++) segment(pixels, points[i - 1], points[i]);
    const tip = points.at(-1);
    if (tip) arrows.push({ ...tip, text: vertical ? "▼" : "▶" });
  });
  return [...pixels.values()]
    .map(({ point, mask }) => ({ ...point, text: GLYPHS[mask] ?? " " }))
    .concat(arrows);
}

function route(
  from: FlowNode,
  to: FlowNode,
  options: { vertical: boolean; lane: number; exit: number; entry: number },
): Point[] {
  const { vertical, lane, exit, entry } = options;
  const start = vertical
    ? [from.y + from.height, from.x + Math.floor(from.width / 2)]
    : [from.x + from.width, from.y + 1];
  const end = vertical ? [to.y - 1, to.x + Math.floor(to.width / 2)] : [to.x - 1, to.y + 1];
  const [, b = 0] = start,
    [c = 0, d = 0] = end;
  const points =
    to.depth === from.depth + 1
      ? [start, [c - entry, b], [c - entry, d], end]
      : [start, [exit, b], [exit, lane], [c - entry, lane], [c - entry, d], end];
  return points.map(([forward = 0, cross = 0]) =>
    vertical ? { x: cross, y: forward } : { x: forward, y: cross },
  );
}

function segment(
  pixels: Map<string, { point: Point; mask: number }>,
  start?: Point,
  end?: Point,
): void {
  if (!start || !end) return;
  const dx = Math.sign(end.x - start.x),
    dy = Math.sign(end.y - start.y);
  let point = { ...start };
  while (point.x !== end.x || point.y !== end.y) {
    const next = { x: point.x + dx, y: point.y + dy };
    addPixel(pixels, point, dx > 0 ? 1 : dx < 0 ? 2 : dy > 0 ? 4 : 8);
    addPixel(pixels, next, dx > 0 ? 2 : dx < 0 ? 1 : dy > 0 ? 8 : 4);
    point = next;
  }
}

function addPixel(
  pixels: Map<string, { point: Point; mask: number }>,
  point: Point,
  mask: number,
): void {
  const key = `${point.x},${point.y}`;
  pixels.set(key, { point, mask: (pixels.get(key)?.mask ?? 0) | mask });
}
