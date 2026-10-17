import { setTimeout } from "node:timers/promises";
import type { RunContext } from "./execution.types.js";
import type { Stage } from "../../contracts/workflow.js";
import type { TaskState } from "../../contracts/run.js";
import { isStage } from "../../contracts/workflow.js";
import { schedule } from "./scheduler.js";
import { runTask } from "./task-runner.js";
import { receiveTaskAnswers } from "./task-input.repository.js";
import { applyDecision, coordinatorTask } from "./orchestration-decision.js";
import { nextRound, routeRepair } from "./orchestration-round.js";
import { orchestrator, ORCHESTRATOR_ID, orchestrationError } from "./orchestration-state.js";

export async function runOrchestration(context: RunContext): Promise<void> {
  const plan = context.report.orchestration;
  if (!plan) return;
  const root = orchestrator(context.report);
  try {
    if (plan.phase === "execute") routeRepair(context);
    while (plan.phase !== "complete" && !context.signal.aborted) {
      if (plan.phase === "coordinate" && !(await coordinate(context))) return;
      if (plan.phase === "execute" && !(await executeChildren(context))) return;
    }
    root.status = context.signal.aborted ? "cancelled" : "completed";
    if (root.status === "completed") {
      root.completedSteps = root.totalSteps;
      for (const step of root.steps ?? []) step.status = "completed";
      delete root.error;
    }
  } catch (error) {
    failOrchestration(root, plan.phase, error);
    throw error;
  } finally {
    if (context.signal.aborted) root.status = "cancelled";
    await context.update(root);
  }
}

async function coordinate(context: RunContext): Promise<boolean> {
  const root = orchestrator(context.report);
  while (root.status === "on_hold" && !context.signal.aborted) {
    await receiveTaskAnswers(context);
    if (root.status === "on_hold") await setTimeout(100);
  }
  if (context.signal.aborted) return false;
  const stages = coordinatorStages(context);
  if (root.completedSteps < root.totalSteps)
    await runTask(
      {
        ...context,
        config: {
          ...context.config,
          stages,
          execution: { mode: "sequential", concurrency: 1, maxRepairs: 0 },
        },
      },
      coordinatorTask(context),
    );
  if (root.status === "on_hold") return true;
  if (root.completedSteps < root.totalSteps) return false;
  await applyDecision(context);
  summarizeDecision(context);
  root.status = "running";
  await context.update(root);
  return true;
}

function failOrchestration(root: TaskState, phase: string, error: unknown): void {
  root.status = "failed";
  root.error = error instanceof Error ? error.message : "Orchestration failed.";
  const step = root.steps?.at(-1);
  if (phase === "coordinate" && step?.status === "completed") {
    step.status = "failed";
    root.completedSteps--;
  }
}

function coordinatorStages(context: RunContext): Stage[] {
  const assignment = context.config.stages.find((stage) => stage.id === "planning");
  if (!assignment) return orchestrationError("Agent orchestration requires a Planning assignment.");
  return (orchestrator(context.report).steps ?? []).map((step) => {
    if (!isStage(step.id)) return orchestrationError("Invalid coordinator step.");
    return {
      id: step.id,
      executor: assignment.executor,
      model: assignment.model,
      ...(assignment.effort ? { effort: assignment.effort } : {}),
    };
  });
}

async function executeChildren(context: RunContext): Promise<boolean> {
  const plan = context.report.orchestration;
  if (!plan) return false;
  const root = orchestrator(context.report);
  root.status = "running";
  if (plan.strategy === "plan") startPlannedManagement(root);
  await context.update(root);
  await schedule(context, plan.tasks);
  if (
    context.report.tasks.some((task) => task.id !== ORCHESTRATOR_ID && task.status !== "completed")
  ) {
    if (routeRepair(context)) {
      await context.update(root);
      return true;
    }
    root.status = context.signal.aborted ? "cancelled" : "blocked";
    root.error = "A managed task did not complete.";
    if (plan.strategy === "plan" && root.steps?.[0])
      root.steps[0].status = context.signal.aborted ? "cancelled" : "failed";
    return false;
  }
  if (plan.strategy === "plan") plan.phase = "complete";
  else nextRound(context);
  await context.update(root);
  return true;
}

function summarizeDecision(context: RunContext): void {
  const root = orchestrator(context.report);
  root.summary =
    context.report.orchestration?.phase === "complete"
      ? "Objective completed. All managed tasks passed."
      : `Plan updated: ${context.report.orchestration?.tasks.length ?? 0} managed tasks. Continue execution.`;
  const step = root.steps?.at(-1);
  if (step) step.summary = root.summary;
}

function startPlannedManagement(root: TaskState): void {
  const step = root.steps?.[0];
  if (step) {
    root.step = step.id;
    step.status = "running";
  }
}
