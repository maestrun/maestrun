import chalk from "chalk";
import stringWidth from "string-width";
import type { RunReport } from "../../contracts/run.js";
import { cell, cleanText } from "../../shared/terminal-text.js";
import { visibleTasks, selectedIndex, type ViewState } from "./run-view-state.js";
import { orchestrationFlowLayout } from "./orchestration-flow-layout.js";
import type { FlowLayout, FlowPart } from "./orchestration-flow-node.js";

type Size = { width: number; height: number };
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function orchestrationFlowchart(report: RunReport, state: ViewState, size: Size): string[] {
  const tasks = visibleTasks(report, state.filter);
  const selected = tasks[selectedIndex(tasks, state)];
  const layout = orchestrationFlowLayout(tasks, Boolean(state.treeDetails), state.flowDirection);
  const focus = layout.nodes.find((node) => node.task === selected);
  const capacity = Math.max(0, size.height - 2);
  const top = clamp((focus?.y ?? 0) + state.scroll, layout.height - capacity);
  const anchor = focus?.x ?? 0;
  const left = clamp(anchor + (state.flowPan ?? 0), layout.width - size.width);
  state.scroll = top - (focus?.y ?? 0);
  state.flowPan = left - anchor;
  return [
    chalk.bold(
      cell(
        `[ Flow ${state.flowDirection === "vertical" ? "↓" : "→"} · ${state.treeDetails ? "Tasks + steps" : "Tasks"} ] D steps · V direction · Shift+←/→ pan`,
        size.width,
      ),
    ),
    ...(!tasks.length
      ? [cell("No tasks in this view.", size.width)]
      : paint(layout, { ...size, height: capacity }, { left, top, selected: selected?.id ?? "" })),
    chalk.dim(
      cell(
        `← ${left} cols · → ${Math.max(0, layout.width - left - size.width)} cols · ↑ ${top} · ↓ ${Math.max(0, layout.height - top - capacity)} · PgUp/PgDn · Home/End`,
        size.width,
      ),
    ),
  ].slice(0, size.height);
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(value, Math.max(0, maximum)));
}

function paint(
  layout: FlowLayout,
  size: Size,
  view: { left: number; top: number; selected?: string },
): string[] {
  const rows = Array.from({ length: Math.min(size.height, layout.height) }, () =>
    Array<string>(size.width).fill(" "),
  );
  for (const part of layout.parts) {
    const row = rows[part.y - view.top];
    if (row) paintPart(row, part, view);
  }
  return rows.map((row) => row.join(""));
}

function paintPart(row: string[], part: FlowPart, view: { left: number; selected?: string }): void {
  const status = part.node?.task.status;
  const color =
    status === "failed" || status === "blocked"
      ? chalk.red
      : status === "on_hold"
        ? chalk.yellow
        : status === "completed"
          ? chalk.green
          : status === "running"
            ? chalk.cyan
            : chalk.white;
  const selected = part.node && part.node.task.id === view.selected && part.y === part.node.y + 1;
  let x = part.x - view.left;
  for (const { segment } of GRAPHEMES.segment(
    cleanText(
      selected
        ? part.text.replace(/^│( {2,})/u, (_, spaces: string) => `│${spaces.slice(2)}› `)
        : part.text,
    ),
  )) {
    const width = stringWidth(segment);
    if (x >= 0 && x + width <= row.length && width > 0) {
      row[x] = selected ? chalk.inverse.bold(segment) : color(segment);
      for (let offset = 1; offset < width; offset++) row[x + offset] = "";
    }
    x += width;
  }
}
