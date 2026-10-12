import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { isRecord } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { maestrunHome } from "../../shared/home.js";

import type { TaskConversation } from "../../contracts/run.js";
export type { TaskConversation, TaskMessage } from "../../contracts/run.js";

export function conversationPath(cwd: string, id: string): string {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("Invalid conversation identifier");
  const project = createHash("sha256").update(resolve(cwd)).digest("hex");
  return join(maestrunHome(), "conversations", project, id);
}

async function existingPath(cwd: string, id: string): Promise<string> {
  const path = conversationPath(cwd, id);
  if ((await snapshotFile(`${path}.json`)).exists) return path;
  return join(cwd, ".maestrun", "conversations", id);
}

export async function readConversation(
  cwd: string,
  id: string,
): Promise<TaskConversation | undefined> {
  const file = await snapshotFile(`${await existingPath(cwd, id)}.json`);
  if (!file.exists) return undefined;
  const value: unknown = JSON.parse(file.content);
  if (!isRecord(value) || typeof value.active !== "boolean" || !Array.isArray(value.messages))
    throw new UserError("Invalid task conversation.", "Inspect ~/.maestrun/conversations.");
  return value as TaskConversation;
}

export async function sendTaskMessage(
  cwd: string,
  conversationId: string,
  text: string,
): Promise<string> {
  if (!text.trim() || text.length > 32000)
    throw new UserError(
      "Instructions must contain 1–32000 characters.",
      "Shorten the message and retry.",
    );
  if (!(await readConversation(cwd, conversationId))?.active)
    throw new UserError(
      "This task's model session has ended or is still starting.",
      "Return to the execution view and select a running task.",
    );
  const id = randomUUID();
  await atomicWrite(
    join(await existingPath(cwd, conversationId), `${Date.now()}-${id}.json`),
    JSON.stringify({ id, text }),
    { exists: false, content: "" },
  );
  return id;
}
