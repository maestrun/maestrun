import type { TaskConversation, TaskState, TaskStep } from "../../contracts/run.js";
import { tokenUsageLabel } from "../../shared/token-usage.js";

const STATUS = {
  pending: "Waiting",
  running: "In progress",
  completed: "Done",
  failed: "Failed",
  refactor: "Needs changes",
  cancelled: "Cancelled",
};

export function taskStepOutput(task: TaskState, logs: boolean): string[] {
  if (!task.steps?.length)
    return [
      task.summary ?? "Step results unavailable.",
      ...(logs ? conversationLines(task.conversation) : []),
    ];
  return task.steps.flatMap((step) => [
    "",
    `${step.title} · ${STATUS[step.status]}`,
    stepResult(task, step),
    ...(logs
      ? conversationLines(
          step.conversation ?? (step.id === task.step ? task.conversation : undefined),
        )
      : []),
    `${step.title}: ${tokenUsageLabel(step)}`,
  ]);
}

function stepResult(task: TaskState, step: TaskStep): string {
  if (step.summary?.trim()) return step.summary;
  if (step.id === task.step && task.error) return `Error: ${task.error}`;
  if (step.status === "pending") return "This step has not started.";
  if (step.status === "running") return "Waiting for the final result. Press L to view the log.";
  return "No final result recorded.";
}

function conversationLines(conversation: TaskConversation | undefined): string[] {
  if (!conversation?.messages.length) return ["No log recorded for this step."];
  return conversation.messages.flatMap((message) => [
    "",
    `${message.role === "user" ? "You" : "Model"}${message.status ? ` · ${message.status}` : ""}`,
    message.text,
    ...(message.error ? [message.error] : []),
  ]);
}
