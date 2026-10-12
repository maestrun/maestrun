import { isRecord } from "../../contracts/workflow.js";
import type { ExecutorId } from "../../contracts/workflow.js";

type Output = { onLine: (line: string) => void; result?: string };

// Display only assistant text; the executor parsers still validate the final result.
export function generationOutput(executor: ExecutorId, write: (text: string) => void): Output {
  let streamed = false;
  const output: Output = { onLine };
  function onLine(line: string): void {
    const value = eventRecord(line);
    if (executor === "codex") return writeCodex(value, write);
    if (executor === "copilot") return writeCopilot(value, write);
    const event = isRecord(value.event) ? value.event : {};
    const delta = isRecord(event.delta) ? event.delta : {};
    if (
      value.type === "stream_event" &&
      event.type === "content_block_delta" &&
      delta.type === "text_delta" &&
      typeof delta.text === "string"
    ) {
      streamed = true;
      write(delta.text);
    }
    if (value.type === "result") {
      output.result = line;
      if (!streamed && value.is_error === false && typeof value.result === "string")
        write(value.result);
    }
  }
  return output;
}

function eventRecord(line: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function writeCodex(value: Record<string, unknown>, write: (text: string) => void): void {
  const item = isRecord(value.item) ? value.item : {};
  if (
    value.type === "item.completed" &&
    item.type === "agent_message" &&
    typeof item.text === "string"
  )
    write(`${item.text}\n\n`);
}

function writeCopilot(value: Record<string, unknown>, write: (text: string) => void): void {
  const data = isRecord(value.data) ? value.data : {};
  if (
    value.type === "assistant.message" &&
    !value.agentId &&
    !data.parentToolCallId &&
    typeof data.content === "string"
  )
    write(`${data.content}\n\n`);
}
