import chalk from "chalk";
import type { RunReport } from "../../contracts/run.js";
import { FILTERS, selectedIndex, visibleTasks } from "./run-view-state.js";
import type { ViewState } from "./run-view-state.js";
import { cell } from "../../shared/terminal-text.js";
import { stage } from "./run-task-view.js";
import { executionBody } from "./task-flowchart.js";

type Screen = { cwd: string; columns: number; rows: number; now: number };

function elapsed(report: RunReport, now: number): string {
  const end = report.finishedAt ? Date.parse(report.finishedAt) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(report.startedAt)) / 1000)) || 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function progress(report: RunReport, now: number): string {
  const done = report.tasks.filter((task) => task.status === "completed").length;
  const steps = report.tasks.reduce((sum, task) => sum + task.completedSteps, 0);
  const total = report.tasks.reduce((sum, task) => sum + task.totalSteps, 0);
  return `${done}/${report.tasks.length} tasks · ${steps}/${total} steps · ${total ? Math.floor((100 * steps) / total) : 0}% · ${elapsed(report, now)}`;
}

function tabs(report: RunReport, state: ViewState, width: number): string {
  const labels = FILTERS.map((name, i) => `${name} ${visibleTasks(report, i).length}`);
  if (labels.join("   ").length + 2 > width)
    return chalk.bold.underline(cell(`  ${labels[state.filter]}  · Tab to filter`, width));
  return `  ${labels.map((text, i) => (i === state.filter ? chalk.bold.underline(text) : chalk.dim(text))).join("   ")}`;
}

export function renderRunScreen(report: RunReport, state: ViewState, screen: Screen): string {
  const width = Math.max(1, screen.columns - 1);
  const height = Math.max(1, screen.rows);
  if (width < 32 || height < 12) return cell(`Maestrun ${progress(report, screen.now)}`, width);
  const rule = chalk.dim("─".repeat(width));
  const lines = [
    chalk.bold(cell("  Maestrun · task command center", width)),
    tabs(report, state, width),
    rule,
    chalk.dim(cell(`  ${screen.cwd}`, width)),
    cell(`  ${progress(report, screen.now)}`, width),
    ...executionBody(report, state, { width, height: height - 9 }),
  ];
  while (lines.length < height - 4) lines.push("");
  lines.push(...footer(report, state, width));
  return lines.map((line) => `\x1b[2K${line}`).join("\r\n");
}

function footer(report: RunReport, state: ViewState, width: number): string[] {
  const tasks = visibleTasks(report, state.filter);
  const selected = tasks[selectedIndex(tasks, state)];
  return [
    chalk.dim("─".repeat(width)),
    cell(
      selected
        ? `  ${stage(selected)} · ${selected.executor ?? "—"} / ${selected.model ?? "—"} · Effort: ${selected.effort ?? "default"}`
        : "",
      width,
    ),
    cell(
      state.notice ??
        (selected?.error
          ? `  ${selected.error}`
          : `  ${selectedIndex(tasks, state) + (tasks.length ? 1 : 0)}/${tasks.length} in view`),
      width,
    ),
    chalk.dim(cell(shortcuts(state, Boolean(report.finishedAt)), width)),
  ];
}

function shortcuts(state: ViewState, finished: boolean): string {
  if (state.details) return "  ↑/↓ scroll · I instructions · Enter/Esc back · Ctrl+C options";
  if (state.flowStep) return "  PgUp/PgDn · Esc tasks · Home/End · F hide";
  return finished
    ? "  PgUp/PgDn steps · ↑/↓ tasks · Tab filter · F flow · Enter details · Esc close"
    : "  PgUp/PgDn steps · ↑/↓ tasks · Tab filter · F flow · I instructions · Enter details · Ctrl+C options";
}
