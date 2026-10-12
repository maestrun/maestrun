import { stageLabel } from "../../contracts/workflow.js";
import type { RunContext } from "./execution.types.js";
import type { TaskState } from "../../contracts/run.js";
import { taskStages } from "./tasks.js";
import type { Task } from "../../contracts/tasks.js";
import { runIsolatedTasks } from "./parallel-tasks.js";
import { runTask } from "./task-runner.js";

async function blockRemaining(context: RunContext, pending: readonly Task[]): Promise<void> {
  for (const task of pending) {
    const state = context.report.tasks.find((entry) => entry.id === task.id);
    if (!state) throw new Error("Missing task state");
    state.status = context.signal.aborted ? "cancelled" : "blocked";
    state.error = context.signal.aborted
      ? "Cancelled before starting."
      : "A dependency did not complete.";
    await context.update(state);
  }
}

export async function schedule(context: RunContext, tasks: readonly Task[]): Promise<void> {
  let pending = tasks.filter(
    (task) =>
      !context.report.tasks.some((state) => state.id === task.id && state.status === "completed"),
  );
  const limit =
    context.config.execution?.mode === "parallel" ? context.config.execution.concurrency : 1;
  while (pending.length && !context.signal.aborted) {
    const done = new Set(
      context.report.tasks.filter((task) => task.status === "completed").map((task) => task.id),
    );
    const ready = pending
      .filter((task) => task.dependsOn.every((id) => done.has(id)))
      .slice(0, limit);
    if (!ready.length) break;
    const isolated =
      context.config.execution?.mode === "parallel" ||
      ready.some((task) =>
        context.report.tasks.some(
          (state) => state.id === task.id && state.worktree && !state.worktree.integrated,
        ),
      );
    if (isolated) await runIsolatedTasks(context, ready);
    else for (const task of ready) await runTask(context, task);
    pending = pending.filter((task) => !ready.includes(task));
  }
  await blockRemaining(context, pending);
}

export function initialTaskState(config: RunContext["config"], task: Task): TaskState {
  return {
    id: task.id,
    title: task.title,
    status: "pending",
    ...(config.execution?.mode === "parallel" ? { integration: "pending" as const } : {}),
    completedSteps: 0,
    totalSteps: taskStages(config, task).length,
    steps: taskStages(config, task).map((stage) => ({
      id: stage.id,
      title: stageLabel(stage.id),
      model: stage.model,
      ...(stage.effort ? { effort: stage.effort } : {}),
      status: "pending",
    })),
  };
}
