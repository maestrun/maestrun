import type { Key } from "node:readline";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Layout } from "../../contracts/layout.js";
import { taskDisplaySteps } from "./task-display-steps.js";
import { treeTasks } from "./task-tree.js";
export const FILTERS = ["All", "Working", "Done", "Waiting", "Issues", "Input"] as const;
export type ViewState = {
  layout?: Layout;
  filter: number;
  selected: string;
  details: boolean;
  treeDetails?: boolean;
  logs?: boolean;
  scroll: number;
  notice?: string;
  flow?: boolean;
  flowStep?: string;
  flowPan?: number;
  flowDirection?: "horizontal" | "vertical";
  follow?: boolean;
};
export function visibleTasks(report: RunReport, filter: number): TaskState[] {
  const matches = matchingTasks(report, filter);
  return report.orchestration ? treeTasks(report, matches) : matches;
}
export function matchingTasks(report: RunReport, filter: number): TaskState[] {
  const statuses = [
    [],
    ["running"],
    ["completed"],
    ["pending"],
    ["failed", "blocked", "cancelled", "refactor"],
    ["on_hold"],
  ];
  return report.tasks.filter((task) => filter === 0 || statuses[filter]?.includes(task.status));
}
export function selectedIndex(tasks: readonly TaskState[], state: ViewState): number {
  return Math.max(
    0,
    tasks.findIndex((task) => task.id === state.selected),
  );
}
export function navigateView(state: ViewState, report: RunReport, key: Key): void {
  state.follow = false;
  if (!key.shift && !["pageup", "pagedown", "home", "end"].includes(key.name ?? ""))
    state.flowPan = 0;
  if (navigateTree(state, report, key)) return;
  if (["pageup", "pagedown", "home", "end"].includes(key.name ?? ""))
    return navigateFlow(state, report, key);
  if (key.name === "f") return toggleFlow(state);
  if (key.name === "h") {
    state.filter = FILTERS.indexOf("Input");
    return resetDetails(state);
  }
  if (key.name === "escape") return resetDetails(state);
  if (key.name === "return" || (key.name === "l" && state.details))
    return toggleDetails(state, key);
  if (["tab", "left", "right"].includes(key.name ?? "")) {
    delete state.flowStep;
    const direction = key.name === "left" || key.shift ? -1 : 1;
    state.filter = (state.filter + direction + FILTERS.length) % FILTERS.length;
    state.details = false;
    state.scroll = 0;
    return;
  }
  moveSelection(state, report, key);
}
function toggleDetails(state: ViewState, key: Key): void {
  if (key.name === "l") state.logs = !state.logs;
  else {
    state.details = !state.details;
    state.logs = false;
  }
  state.scroll = 0;
}
function moveSelection(state: ViewState, report: RunReport, key: Key): void {
  const direction = key.name === "up" ? -1 : key.name === "down" ? 1 : 0;
  if (state.details) {
    state.scroll = Math.max(0, state.scroll + direction);
    return;
  }
  const tasks = visibleTasks(report, state.filter);
  const index = Math.max(0, Math.min(tasks.length - 1, selectedIndex(tasks, state) + direction));
  if (state.selected !== tasks[index]?.id) delete state.flowStep;
  if (state.selected !== tasks[index]?.id) state.scroll = 0;
  state.selected = tasks[index]?.id ?? "";
}
function toggleFlow(state: ViewState): void {
  state.flow = !state.flow;
  state.scroll = 0;
  state.details = false;
  delete state.flowStep;
}
function navigateFlow(state: ViewState, report: RunReport, key: Key): void {
  const tasks = visibleTasks(report, state.filter);
  const task = tasks[selectedIndex(tasks, state)];
  const steps = taskDisplaySteps(task);
  if (!steps.length) return;
  const current = Math.max(
    0,
    steps.findIndex((step) => step.id === (state.flowStep ?? task?.step)),
  );
  const next =
    key.name === "home"
      ? 0
      : key.name === "end"
        ? steps.length - 1
        : current + (key.name === "pageup" ? -1 : 1);
  const step = steps[Math.max(0, Math.min(steps.length - 1, next))];
  if (step) state.flowStep = step.id;
  state.flow = true;
  state.details = false;
}
function navigateTree(state: ViewState, report: RunReport, key: Key): boolean {
  if (!report.orchestration || state.details) return false;
  if (key.name === "v" && state.flow) {
    state.flowDirection = state.flowDirection === "vertical" ? "horizontal" : "vertical";
    state.scroll = 0;
    state.flowPan = 0;
    return true;
  }
  if (state.flow && key.shift && ["left", "right"].includes(key.name ?? "")) {
    state.flowPan = (state.flowPan ?? 0) + (key.name === "left" ? -12 : 12);
    return true;
  }
  if (key.name === "d") {
    state.treeDetails = !state.treeDetails;
    state.scroll = 0;
    return true;
  }
  if (["pageup", "pagedown", "home", "end"].includes(key.name ?? "")) {
    if (key.name === "home" || key.name === "end")
      state.scroll = key.name === "home" ? -Infinity : Infinity;
    else state.scroll += key.name === "pageup" ? -5 : 5;
    return true;
  }
  return false;
}
function resetDetails(state: ViewState): void {
  delete state.flowStep;
  state.details = false;
  state.scroll = 0;
}
