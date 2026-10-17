import type { Task } from "../../contracts/tasks.js";
import { DEFAULT_MAX_REPAIRS } from "../../contracts/workflow.js";
import type { RunContext } from "./execution.types.js";
import {
  MAX_ORCHESTRATOR_ROUNDS,
  orchestrationError,
  orchestrator,
} from "./orchestration-state.js";

export function nextRound(context: RunContext): void {
  const plan = context.report.orchestration;
  if (!plan) return;
  if (plan.round >= MAX_ORCHESTRATOR_ROUNDS)
    return orchestrationError("The orchestrator reached its 20-round limit.");
  plan.round++;
  plan.phase = "coordinate";
  const root = orchestrator(context.report);
  root.steps?.push({
    id: `custom:Coordinate ${plan.round}`,
    title: `Coordinate ${plan.round}`,
    status: "pending",
  });
  root.totalSteps++;
}

export function routeRepair(context: RunContext): boolean {
  const plan = context.report.orchestration;
  if (
    plan?.strategy !== "agent" ||
    context.signal.aborted ||
    !context.report.tasks.some((task) => task.status === "refactor") ||
    (plan.repairRounds ?? 0) >= (context.config.execution?.maxRepairs ?? DEFAULT_MAX_REPAIRS)
  )
    return false;
  nextRound(context);
  plan.repairRounds = (plan.repairRounds ?? 0) + 1;
  return true;
}

export function validateRepairs(context: RunContext, tasks: readonly Task[]): void {
  const existing = new Set(context.report.orchestration?.tasks.map((task) => task.id));
  const repairs = tasks.filter((task) => task.repairFor && !existing.has(task.id));
  for (const repair of repairs)
    if (
      !context.report.tasks.some(
        (state) => state.id === repair.repairFor && state.status === "refactor",
      )
    )
      return orchestrationError(`Repair ${repair.id} must address a task requesting changes.`);
  for (const state of context.report.tasks)
    if (state.status === "refactor" && !repairs.some((task) => task.repairFor === state.id))
      return orchestrationError(
        `Task ${state.id} needs a new specialist repair task before repeating its review.`,
      );
}
