import type { Task } from "../../contracts/tasks.js";
import { ORCHESTRATOR_STEPS } from "../../contracts/tasks.js";
import type { RunContext } from "./execution.types.js";
import { isRecord } from "../../contracts/workflow.js";
import { parseTasks, taskStages } from "./tasks.js";
import { resolveTaskAgents, taskDefinition } from "./task-agents.js";
import { buildReport } from "./run-checkpoint.js";
import { saveOrchestrationConfig } from "./orchestration-config.js";
import { validateRepairs } from "./orchestration-round.js";
import { orchestrationError, ORCHESTRATOR_ID, orchestrator } from "./orchestration-state.js";
import { orchestrationHierarchy } from "./orchestration-hierarchy.js";

export function coordinatorTask(context: RunContext): Task {
  const plan = context.report.orchestration;
  return {
    id: ORCHESTRATOR_ID,
    title: "Main task",
    dependsOn: [],
    instructions: [
      "Coordinate this workflow. Inspect the objective, current plan and task evidence. Do not implement subtasks yourself or modify Maestrun state files.",
      'Use the normal completed status/summary response. The summary MUST be a JSON-encoded decision object: {"done":false,"tasks":[...]} or {"done":true}.',
      "For done:false, return the FULL nonempty task plan. Each task has id, title, instructions, dependsOn (array), optional target, parentId, repairFor, steps (execution stage ids in task-specific order) and agents (step id to agent file path). agentAssignments is computed from those files; do not supply or change it.",
      ORCHESTRATOR_STEPS,
      "Honor the task-specific Steps and step instructions supplied in the source plan, including user edits. Do not replace them with a fixed global workflow.",
      "Preserve started/completed task definitions exactly. You may revise unstarted tasks and add new tasks. Use dependencies for ordering and parentId for grouping. Do not create parent cycles. Never use the reserved id __orchestrator__.",
      "Declare every prerequisite in dependsOn, including dependencies between sibling tasks. Independent tasks may run in parallel. Omit parentId unless an explicit grouping is needed; the displayed hierarchy follows dependencies automatically.",
      'When a task reports refactor, add concrete repair tasks assigned to the responsible specialists, including independent verification. Each new repair task must set "repairFor":"failing-task-id". The failed task waits for these repairs before retrying; preserve its definition. Repairs may depend on completed prerequisites or other repair tasks, never on the failing task or its dependants. Do not repeat QA alone or ask reviewers to implement outside their scope. Do not treat a screenshot file as evidence that someone inspected it.',
      "Only return done:true when all tasks have completed and the objective is satisfied. Otherwise add concrete follow-up work. There are at most 20 coordination rounds.",
      `Configured step assignment overrides (other steps inherit Planning): ${context.config.stages
        .filter((stage) => stage.id !== "planning")
        .map((stage) => stage.id)
        .join(", ")}`,
      `Objective and original plan: ${JSON.stringify(plan?.source)}`,
      `Current plan: ${JSON.stringify(plan?.tasks)}`,
      `Task evidence: ${JSON.stringify(context.report.tasks.filter((task) => task.id !== ORCHESTRATOR_ID).map(({ id, status, summary, error }) => ({ id, status, summary, error })))}`,
    ].join("\n"),
  };
}

function parseDecision(summary: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(summary);
  } catch {
    return orchestrationError("The orchestrator returned invalid decision JSON.");
  }
  if (!isRecord(value) || typeof value.done !== "boolean")
    return orchestrationError("The orchestrator decision needs a boolean done field.");
  return value;
}

export async function applyDecision(context: RunContext): Promise<void> {
  const plan = context.report.orchestration;
  if (!plan) return;
  const decision = parseDecision(orchestrator(context.report).summary ?? "");
  if (decision.done) {
    if (
      context.report.tasks.some(
        (task) => task.id !== ORCHESTRATOR_ID && task.status !== "completed",
      )
    )
      return orchestrationError("The orchestrator cannot finish with incomplete tasks.");
    plan.phase = "complete";
    return;
  }
  const tasks = await resolveTaskAgents(
    context.cwd,
    context.config,
    parseTasks({ version: 1, tasks: decision.tasks }),
  );
  validateDecision(context, tasks);
  validateRepairs(context, tasks);
  replacePlan(context, tasks);
  await saveOrchestrationConfig(context.cwd, context.config, tasks);
}

function replacePlan(context: RunContext, tasks: readonly Task[]): void {
  const plan = context.report.orchestration;
  if (!plan) return;
  const root = orchestrator(context.report);
  const previous = context.report.tasks.filter((task) => task.id !== ORCHESTRATOR_ID);
  const preserved = previous.filter(
    (state) =>
      state.status !== "pending" ||
      state.completedSteps > 0 ||
      state.worktree ||
      state.conversationId,
  );
  const updated = buildReport(context.config, tasks, { previous: preserved });
  orchestrationHierarchy(updated.tasks, tasks, ORCHESTRATOR_ID);
  context.report.tasks = [root, ...updated.tasks];
  plan.tasks = tasks;
  plan.phase = "execute";
}

function validateDecision(context: RunContext, tasks: readonly Task[]): void {
  for (const task of tasks) {
    if (task.id === ORCHESTRATOR_ID)
      return orchestrationError("The orchestrator returned a reserved task id.");
    taskStages(context.config, task);
  }
  for (const old of context.report.orchestration?.tasks ?? []) {
    const state = context.report.tasks.find((task) => task.id === old.id);
    const started =
      state &&
      (state.status !== "pending" ||
        state.completedSteps > 0 ||
        state.worktree ||
        state.conversationId);
    const current = tasks.find((task) => task.id === old.id);
    if (
      started &&
      (!current || JSON.stringify(taskDefinition(current)) !== JSON.stringify(taskDefinition(old)))
    )
      return orchestrationError(`The orchestrator changed started task ${old.id}.`);
  }
  if (
    tasks.every((task) =>
      context.report.tasks.some((state) => state.id === task.id && state.status === "completed"),
    )
  )
    return orchestrationError("The orchestrator must finish or add unfinished work.");
}
