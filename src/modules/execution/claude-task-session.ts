import type { StepInput } from "../../contracts/run.js";
import { isRecord } from "../../contracts/workflow.js";
import { claudeEnvironment, parseClaudeOutput } from "../executors/index.js";
import { argumentsFor } from "./step-protocol.js";
import { taskModelProcess } from "./task-model-process.js";
import type { ModelProcess } from "./task-model-process.js";
import type { TaskChannel } from "./task-conversation.js";
import type { TaskMessage } from "./task-conversation.repository.js";
import { tokenUsageCollector } from "../../shared/token-usage.js";

type State = {
  model: ModelProcess;
  channel: TaskChannel;
  queue: TaskMessage[];
  streamed: boolean;
  modelId: string;
};

export async function claudeTaskSession(
  input: StepInput,
  prompt: string,
  channel: TaskChannel,
): Promise<string> {
  const args = argumentsFor(input).map((arg) => (arg === "json" ? "stream-json" : arg));
  const model = taskModelProcess(
    {
      executable: "claude",
      args: [...args, "--input-format", "stream-json", "--verbose", "--include-partial-messages"],
      cwd: input.cwd,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      env: claudeEnvironment(input.stage.effort),
    },
    (value) => receive(state, value),
    tokenUsageCollector("claude", input.onUsage).event,
  );
  const state: State = { model, channel, queue: [], streamed: false, modelId: input.stage.model };
  channel.listen(async (message) => {
    state.queue.push(message);
    return "queued";
  });
  send(model, prompt);
  try {
    return await model.done;
  } finally {
    await model.close();
  }
}

function send(model: ModelProcess, text: string): void {
  model.send({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
}

function receive(state: State, value: Record<string, unknown>): void {
  const event = isRecord(value.event) ? value.event : {};
  const delta = isRecord(event.delta) ? event.delta : {};
  if (
    value.type === "stream_event" &&
    delta.type === "text_delta" &&
    typeof delta.text === "string"
  ) {
    state.streamed = true;
    state.channel.output(delta.text);
  }
  if (value.type === "result") void finishTurn(state, value).catch(state.model.fail);
}

async function finishTurn(state: State, value: Record<string, unknown>): Promise<void> {
  const text = parseClaudeOutput(
    { code: 0, stdout: JSON.stringify(value), stderr: "" },
    state.modelId,
  );
  if (!state.streamed) state.channel.output(text);
  state.channel.output("\n\n");
  state.streamed = false;
  await state.channel.flush();
  const messages = state.queue.splice(0);
  if (!messages.length) {
    state.model.resolve(text);
    return;
  }
  send(state.model, messages.map((message) => message.text).join("\n\n"));
  for (const message of messages) message.status = "sent";
}
