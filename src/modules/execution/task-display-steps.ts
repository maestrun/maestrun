import type { TaskState, TaskStep } from "../../contracts/run.js";

export function taskDisplaySteps(task: TaskState | undefined): TaskStep[] {
  const steps = task?.steps ?? [];
  if (!task || (!task.worktree && !task.integration && task.step !== "integration")) return steps;
  if (steps.some((step) => step.id === "integration")) return steps;
  return [
    ...steps,
    {
      id: "integration",
      title: "Integration",
      status: integrationStatus(task),
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
    },
  ];
}

function integrationStatus(task: TaskState): TaskStep["status"] {
  if (task.worktree?.integrated) return "completed";
  if (task.step === "integration") {
    if (task.status === "failed" || task.status === "cancelled") return task.status;
    if (task.status === "completed") return "completed";
    return task.integration ?? (task.status === "running" ? "running" : "pending");
  }
  return "pending";
}
