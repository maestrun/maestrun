import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskState } from "../../contracts/run.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { ensureHomeDirectory } from "../../shared/home.js";
import { UserError } from "../../shared/errors.js";
import { isRecord } from "../../contracts/workflow.js";
import { conversationPath } from "./task-conversation.repository.js";
import { pendingInput, validInputRequests, validInputText } from "./task-input.js";
import type { RunContext } from "./execution.types.js";

function answerPath(cwd: string, id: string): string {
  return `${conversationPath(cwd, id)}.answer.json`;
}

export async function answerTaskInput(cwd: string, task: TaskState, text: string): Promise<void> {
  const request = pendingInput(task);
  if (!request || !validInputText(text))
    throw new UserError(
      "Enter an answer with 1–32000 characters.",
      "Select a task awaiting input.",
    );
  const report: unknown = JSON.parse((await snapshotFile(join(cwd, ".maestrun/run.json"))).content);
  const current: unknown =
    isRecord(report) && Array.isArray(report.tasks)
      ? report.tasks.find((entry: unknown) => isRecord(entry) && entry.id === task.id)
      : undefined;
  if (
    !isRecord(current) ||
    current.status !== "on_hold" ||
    !validInputRequests(current.inputRequests) ||
    !Array.isArray(current.inputRequests) ||
    !current.inputRequests.some(
      (entry: unknown) => isRecord(entry) && entry.id === request.id && entry.answer === undefined,
    )
  )
    throw new UserError("This question is no longer pending.", "Return to the pending input list.");
  await ensureHomeDirectory("conversations");
  const path = answerPath(cwd, request.id);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await atomicWrite(path, JSON.stringify({ answer: text }), { exists: false, content: "" });
}

export async function receiveTaskAnswers(context: RunContext): Promise<void> {
  for (const task of context.report.tasks) {
    const request = pendingInput(task);
    if (task.status !== "on_hold" || !request) continue;
    const path = answerPath(context.cwd, request.id);
    const file = await snapshotFile(path);
    if (!file.exists) continue;
    const value: unknown = JSON.parse(file.content);
    if (!isRecord(value) || !validInputText(value.answer))
      throw new UserError("Invalid saved answer.", "Restore or remove the invalid answer file.");
    request.answer = value.answer;
    task.status = "pending";
    const step = task.steps?.find((entry) => entry.id === request.stage);
    if (step) step.status = "pending";
    await context.update(task);
    await rm(path);
  }
}
