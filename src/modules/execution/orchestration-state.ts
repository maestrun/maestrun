import { join } from "node:path";
import type { RunReport, TaskState } from "../../contracts/run.js";
import type { Task } from "../../contracts/tasks.js";
import { isRecord, type Config } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { buildReport, readCheckpoint } from "./run-checkpoint.js";
import { parseTasks } from "./tasks.js";
import { resolveTaskAgents } from "./task-agents.js";
import { pendingInput } from "./task-input.js";
import { orchestrationHierarchy } from "./orchestration-hierarchy.js";

export const ORCHESTRATOR_ID = "__orchestrator__";
export const MAX_ORCHESTRATOR_ROUNDS = 20;
export type Orchestration = NonNullable<RunReport["orchestration"]>;

export function orchestrationError(message: string): never {
  throw new UserError(
    message,
    "Inspect the orchestration plan and .maestrun/run.json before resuming.",
  );
}

function savedOrchestration(value: unknown): Orchestration | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !["plan", "agent"].includes(String(value.strategy)) ||
    !["coordinate", "execute", "complete"].includes(String(value.phase)) ||
    !Number.isInteger(value.round) ||
    Number(value.round) < 1 ||
    Number(value.round) > MAX_ORCHESTRATOR_ROUNDS ||
    (value.repairRounds !== undefined &&
      (!Number.isInteger(value.repairRounds) ||
        Number(value.repairRounds) < 0 ||
        Number(value.repairRounds) > 100))
  )
    return orchestrationError("Invalid orchestration checkpoint.");
  const source = parseTasks({ version: 1, tasks: value.source });
  const tasks = parseTasks({ version: 1, tasks: value.tasks });
  return { ...value, source, tasks } as Orchestration;
}

export async function orchestrationReport(
  cwd: string,
  config: Config,
  source: readonly Task[],
): Promise<RunReport> {
  const previous = await readCheckpoint(cwd);
  const saved = await readOrchestration(cwd);
  const strategy = config.execution?.orchestrator;
  if (
    saved &&
    (saved.strategy !== strategy || JSON.stringify(saved.source) !== JSON.stringify(source))
  )
    return orchestrationError("The orchestrator mode or source plan changed since the saved run.");
  const tasks = await resolveTaskAgents(cwd, config, saved?.tasks ?? source);
  const report = buildReport(config, tasks, {
    previous: strategy ? previous.filter((task) => task.id !== ORCHESTRATOR_ID) : previous,
  });
  if (!strategy) return report;
  report.orchestration = {
    ...(saved ?? {
      strategy,
      source,
      phase: strategy === "agent" ? "coordinate" : "execute",
      round: 1,
    }),
    tasks,
  };
  attachOrchestrator(report, previous, Boolean(saved));
  return report;
}

function restoreRefactors(report: RunReport, previous: readonly TaskState[]): void {
  for (const state of report.tasks)
    if (previous.some((old) => old.id === state.id && old.status === "refactor"))
      state.status = "refactor";
}

function attachOrchestrator(
  report: RunReport,
  previous: readonly TaskState[],
  saved: boolean,
): void {
  const plan = report.orchestration;
  if (!plan) return;
  if (plan.strategy === "agent") restoreRefactors(report, previous);
  if (report.tasks.some((task) => task.id === ORCHESTRATOR_ID))
    return orchestrationError(`Task id ${ORCHESTRATOR_ID} is reserved for the orchestrator.`);
  const root =
    previous.find((task) => task.id === ORCHESTRATOR_ID) ?? initialOrchestrator(plan.strategy);
  if (saved && !previous.some((task) => task.id === ORCHESTRATOR_ID))
    return orchestrationError("Missing orchestrator checkpoint.");
  delete root.repairAttempts;
  if (plan.phase !== "complete") root.status = pendingInput(root) ? "on_hold" : "pending";
  orchestrationHierarchy(report.tasks, plan.tasks, ORCHESTRATOR_ID);
  report.tasks.unshift(root);
}

function initialOrchestrator(strategy: "plan" | "agent"): TaskState {
  return {
    id: ORCHESTRATOR_ID,
    title: "Main task",
    status: "pending",
    completedSteps: 0,
    totalSteps: 1,
    steps: [
      {
        id: strategy === "plan" ? "custom:Manage planned tasks" : "custom:Coordinate 1",
        title: strategy === "plan" ? "Manage planned tasks" : "Coordinate 1",
        status: "pending",
      },
    ],
  };
}

export function orchestrator(report: RunReport): TaskState {
  const root = report.tasks.find((task) => task.id === ORCHESTRATOR_ID);
  if (!root) return orchestrationError("Missing main task.");
  return root;
}

export async function readOrchestration(cwd: string): Promise<Orchestration | undefined> {
  const snapshot = await snapshotFile(join(cwd, ".maestrun/run.json"));
  return savedOrchestration(
    snapshot.exists ? (JSON.parse(snapshot.content) as RunReport).orchestration : undefined,
  );
}
