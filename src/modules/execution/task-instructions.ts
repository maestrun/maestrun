import { input } from "@inquirer/prompts";
import { setTimeout } from "node:timers/promises";
import type { TaskState } from "../../contracts/run.js";
import { isCancellation, UserError } from "../../shared/errors.js";
import { withBack } from "../../shared/navigation.js";
import { readConversation, sendTaskMessage } from "./task-conversation.repository.js";
import type { SessionView } from "./execution.types.js";

export function taskInstructions(state: SessionView, task: TaskState): void {
  if (state.choosing) return;
  let interrupted = false;
  state.view?.close();
  delete state.view;
  state.prompt = new AbortController();
  state.choosing = compose(state, task)
    .catch((error: unknown) => {
      interrupted = error instanceof Error && error.name === "ExitPromptError";
      if (!isCancellation(error) && !(error instanceof Error && error.message === "Back"))
        state.notice = error instanceof UserError ? error.message : "Could not send instructions.";
    })
    .finally(() => {
      delete state.choosing;
      delete state.prompt;
      if (interrupted) process.emit("SIGINT");
    });
}

async function compose(state: SessionView, task: TaskState): Promise<void> {
  if (task.status !== "running" || !task.conversationId)
    throw new UserError(
      "Select a running model task to add instructions.",
      "Choose a task with an active model session.",
    );
  const text = await withBack(
    (signal) =>
      input(
        {
          message: `Instructions for ${task.id} · ${task.model} (Esc returns)`,
          validate: (value) =>
            (value.trim().length > 0 && value.length <= 32000) || "Enter 1–32000 characters.",
        },
        { signal },
      ),
    state.prompt?.signal ?? new AbortController().signal,
  );
  const id = await sendTaskMessage(state.cwd, task.conversationId, text);
  state.notice = await delivery(state.cwd, task.conversationId, id);
  showConversation(state);
}

async function delivery(cwd: string, conversationId: string, id: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const conversation = await readConversation(cwd, conversationId);
    const message = conversation?.messages.find((entry) => entry.id === id);
    if (message?.status === "sent") return "Instructions sent to the task model.";
    if (message?.status === "queued") return "Instructions queued for the next model turn.";
    if (message?.status === "rejected" || !conversation?.active)
      return "Instructions were not delivered: this model turn ended. Select the current running step and retry.";
    await setTimeout(100);
  }
  return "Delivery is still pending. Check the task conversation before sending again.";
}

function showConversation(state: SessionView): void {
  if (!state.selection) return;
  state.selection.details = true;
  state.selection.logs = true;
  state.selection.follow = true;
}
