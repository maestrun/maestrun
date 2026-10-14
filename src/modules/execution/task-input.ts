import { randomUUID } from "node:crypto";
import type { TaskInputRequest, TaskState, StepInput } from "../../contracts/run.js";
import { isRecord } from "../../contracts/workflow.js";
import { StepInputRequired } from "../../shared/errors.js";
import { setStepStatus } from "./task-step-state.js";

export function pendingInput(task: TaskState): TaskInputRequest | undefined {
  return task.inputRequests?.find((request) => request.answer === undefined);
}

export function holdTask(state: TaskState, error: StepInputRequired): void {
  state.status = "on_hold";
  setStepStatus(state, "on_hold");
  state.inputRequests ??= [];
  state.inputRequests.push({
    id: randomUUID(),
    stage: state.step ?? "",
    question: error.question,
    summary: error.summary,
  });
}

export function validInputRequests(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.every(validRequest)) return false;
  return (
    new Set(value.map((request) => request.id)).size === value.length &&
    value.filter((request) => request.answer === undefined).length <= 1
  );
}

function validRequest(value: unknown): value is TaskInputRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value.id) &&
    typeof value.stage === "string" &&
    Boolean(value.stage) &&
    validInputText(value.question) &&
    validInputText(value.summary) &&
    (value.answer === undefined || validInputText(value.answer))
  );
}

export function validInputText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 32000;
}

export function requireTaskInput(value: unknown): void {
  if (!isRecord(value) || !["needs_input", "on_hold"].includes(String(value.status))) return;
  if (!validInputText(value.question) || !validInputText(value.summary))
    throw new Error("Invalid request for user input: provide a question and resume context.");
  throw new StepInputRequired(value.question, value.summary);
}

export function inputPrompt(input: StepInput): string[] {
  return [
    'If a user decision, clarification, layout choice, PR approval, login, or other external prerequisite is required, return ONLY JSON: {"status":"needs_input","question":"the exact question, with choices if applicable","summary":"why the task is on hold, progress so far, and context needed to resume"}. Use status on_hold for external prerequisites, or needs_input for questions and decisions. Explain exactly what the user must do, include concrete options when helpful, and ask for confirmation after any external action. Do not ask for passwords or tokens in the answer; ask the user to authenticate through the executor or service directly. Stop work until answered. Do not guess or report failed for missing user input. Report actual execution errors and failed checks as failed.',
    ...(input.inputRequests?.length
      ? [
          `Earlier questions and user answers: ${JSON.stringify(input.inputRequests)}\nContinue this stage using these answers and existing files. Preserve completed work.`,
        ]
      : []),
  ];
}
