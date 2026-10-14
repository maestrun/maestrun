import chalk from "chalk";
import type { TaskState } from "../../contracts/run.js";
import { cell } from "../../shared/terminal-text.js";
import { pendingInput } from "./task-input.js";

export function holdColor(text: string): string {
  return chalk.hex("#FFAA33")(text);
}

export function heldTaskLines(task: TaskState, selected: boolean, width: number): string[] {
  const inner = Math.max(1, width - 4);
  const border = (text: string): string => ` ${holdColor(`│${cell(text, inner)}│`)}`;
  const title = cell(`${selected ? "›" : " "} ${task.id} · ${task.title}`, inner);
  return [
    ` ${holdColor(`┌${"─".repeat(inner)}┐`)}`,
    ` ${holdColor("│")}${selected ? chalk.inverse.bold(title) : title}${holdColor("│")}`,
    border("On hold · awaiting your input"),
    border(pendingInput(task)?.summary ?? "Waiting for your decision"),
    border(pendingInput(task)?.question ?? "Input required"),
    border("Enter full question + answer · I answer"),
    ` ${holdColor(`└${"─".repeat(inner)}┘`)}`,
  ];
}

export function taskInputDetails(task: TaskState): string[] {
  return (task.inputRequests ?? []).flatMap((request) => [
    "",
    `${request.answer === undefined ? "Awaiting your input · I answer" : "Answered"} · ${request.stage}`,
    request.summary,
    `Model: ${request.question}`,
    ...(request.answer === undefined ? [] : [`You: ${request.answer}`]),
  ]);
}
