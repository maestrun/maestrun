import { readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { isRecord } from "../../contracts/workflow.js";
import { conversationPath } from "./task-conversation.repository.js";
import type { TaskConversation, TaskMessage } from "./task-conversation.repository.js";
import { ensureHomeDirectory } from "../../shared/home.js";

export type TaskChannel = {
  output: (text: string) => void;
  listen: (send: (message: TaskMessage) => Promise<"sent" | "queued">) => void;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export async function taskChannel(cwd: string, id: string): Promise<TaskChannel> {
  await ensureHomeDirectory("conversations");
  const directory = conversationPath(cwd, id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const state: TaskConversation = { active: false, messages: [] };
  const save = (): Promise<void> => saveConversation(directory, state);
  let send: ((message: TaskMessage) => Promise<"sent" | "queued">) | undefined;
  let pending = Promise.resolve();
  const flush = (): Promise<void> => {
    pending = pending.then(async () => {
      if (send) await deliver(directory, state, send);
      await save();
    });
    return pending;
  };
  const timer = poll(flush, state);
  return {
    output: (text) => appendOutput(state, text),
    listen: (handler) => {
      send = handler;
      state.active = true;
    },
    flush,
    close: async () => {
      clearInterval(timer);
      await finishConversation(state, pending, save);
    },
  };
}

function appendOutput(state: TaskConversation, text: string): void {
  const last = state.messages.at(-1);
  if (last?.role === "model") last.text += text;
  else state.messages.push({ id: randomUUID(), role: "model", text });
}

async function deliver(
  directory: string,
  state: TaskConversation,
  send: (message: TaskMessage) => Promise<"sent" | "queued">,
): Promise<void> {
  for (const name of (await readdir(directory))
    .filter((name) => /^\d+-[a-f0-9-]+\.json$/u.test(name))
    .sort()) {
    const path = join(directory, name);
    const value: unknown = JSON.parse((await snapshotFile(path)).content);
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 32000
    )
      throw new Error("Invalid task instructions");
    const message: TaskMessage = { id: value.id, role: "user", text: value.text, status: "queued" };
    state.messages.push(message);
    try {
      message.status = await send(message);
    } catch {
      message.status = "rejected";
      message.error = "The model did not accept these instructions. Its turn may have ended.";
    }
    await rm(path);
  }
}

function poll(flush: () => Promise<void>, state: TaskConversation): NodeJS.Timeout {
  let busy = false;
  return setInterval(() => {
    if (busy) return;
    busy = true;
    void flush()
      .catch(() => {
        state.active = false;
      })
      .finally(() => {
        busy = false;
      });
  }, 100);
}

async function saveConversation(directory: string, state: TaskConversation): Promise<void> {
  await atomicWrite(
    `${directory}.json`,
    JSON.stringify(state),
    await snapshotFile(`${directory}.json`),
  );
}

function rejectQueued(state: TaskConversation): void {
  for (const message of state.messages) {
    if (message.status !== "queued") continue;
    message.status = "rejected";
    message.error = "The task ended before the model received these instructions.";
  }
}

async function finishConversation(
  state: TaskConversation,
  pending: Promise<void>,
  save: () => Promise<void>,
): Promise<void> {
  state.active = false;
  try {
    await pending;
  } finally {
    rejectQueued(state);
    await save();
  }
}
