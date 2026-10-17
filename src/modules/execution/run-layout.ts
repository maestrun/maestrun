import chalk from "chalk";
import stringWidth from "string-width";
import type { FlowchartLayout } from "../../contracts/layout.js";
import type { RunReport } from "../../contracts/run.js";
import { cell } from "../../shared/terminal-text.js";
import { taskBody } from "./run-task-view.js";
import { row } from "./run-columns.js";
import { visibleTasks, type ViewState } from "./run-view-state.js";
import { taskTree } from "./task-tree.js";

type Size = { width: number; height: number };
const HEADERS = ["  Task", "Name", "Status", "Stage", "Model", "Effort", "Steps", "in/out"];

export function taskTable(report: RunReport, state: ViewState, size: Size): string[] {
  return [
    chalk.dim(
      state.details
        ? cell(state.logs ? "  Task logs · L results" : "  Task details · L full logs", size.width)
        : report.orchestration
          ? cell(`  Task tree · D ${state.treeDetails ? "hide" : "show"} all steps`, size.width)
          : row(HEADERS, size.width, state.layout?.columns),
    ),
    ...(report.orchestration && !state.details
      ? taskTree(visibleTasks(report, state.filter), {
          ...size,
          ...state,
          state,
          height: size.height - 1,
        })
      : taskBody(report, state, { ...size, height: size.height - 1 })),
  ];
}

type Panels = { table: Size; chart: Size; stacked: boolean };

export function panelSizes(
  size: Size,
  flow: FlowchartLayout,
  autoWidth: number,
): Panels | undefined {
  const stacked = flow.position === "top" || flow.position === "bottom";
  if (stacked) {
    if (size.height < 13) return undefined;
    const height = Math.min(
      size.height - 4,
      flow.height === "auto" ? Math.max(9, Math.floor(size.height / 2)) : flow.height,
    );
    return {
      table: { ...size, height: size.height - height - 1 },
      chart: { ...size, height },
      stacked,
    };
  }
  if (size.width < 96) return undefined;
  const width =
    flow.width === "auto"
      ? Math.min(autoWidth, size.width - Math.floor(size.width * 0.53) - 3)
      : Math.min(flow.width, size.width - 35);
  return { table: { ...size, width: size.width - width - 3 }, chart: { ...size, width }, stacked };
}

export function joinPanels(panels: { lines: string[]; size: Size }[], stacked: boolean): string[] {
  const padded = panels.map(({ lines, size }) =>
    Array.from({ length: size.height }, (_, index) => {
      const line = lines[index] ?? "";
      return line + " ".repeat(Math.max(0, size.width - stringWidth(line)));
    }),
  );
  const [first = [], second = []] = padded;
  if (stacked) return [...first, chalk.dim("─".repeat(panels[0]?.size.width ?? 0)), ...second];
  return first.map((line, index) => `${line} ${chalk.dim("│")} ${second[index] ?? ""}`);
}
