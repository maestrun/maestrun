import { randomUUID } from "node:crypto";
import type { StepInput } from "../../contracts/run.js";
import { generateCopilot, generateGrok } from "../executors/index.js";
import type { TaskChannel } from "./task-conversation.js";
import type { TaskMessage } from "./task-conversation.repository.js";

export async function headlessTaskSession(
  input: StepInput,
  prompt: string,
  channel: TaskChannel,
): Promise<string> {
  const queue: TaskMessage[] = [];
  channel.listen(async (message) => {
    queue.push(message);
    return "queued";
  });
  const options = {
    ...input,
    ...input.stage,
    sessionId: randomUUID(),
    execution: true,
    onOutput: channel.output,
  };
  let nextPrompt = prompt;
  const generate = input.stage.executor === "grok" ? generateGrok : generateCopilot;
  let sent: TaskMessage[] = [];
  while (true) {
    const text = await generate({ ...options, prompt: nextPrompt, resume: sent.length > 0 });
    for (const message of sent) message.status = "sent";
    await channel.flush();
    const messages = queue.splice(0);
    if (!messages.length) return text;
    nextPrompt = messages.map((message) => message.text).join("\n\n");
    sent = messages;
  }
}
