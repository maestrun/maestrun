import { isRecord } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import type { CommandResult } from "../../shared/process.js";

function outputError(): UserError {
  return new UserError(
    "Copilot returned invalid or incomplete output.",
    "Run copilot update and retry with a supported model.",
  );
}

function parseEvents(stdout: string): readonly Record<string, unknown>[] {
  try {
    return stdout
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => {
        const value: unknown = JSON.parse(line);
        if (!isRecord(value)) throw outputError();
        return value;
      });
  } catch {
    throw outputError();
  }
}

export function parseCopilotOutput(result: CommandResult, model: string): string {
  if (result.code !== 0) throw executorFailure("GitHub Copilot", result.stderr);
  let text = "";
  let completed = false;
  for (const event of parseEvents(result.stdout)) {
    const data = isRecord(event.data) ? event.data : {};
    if (event.type === "session.error")
      throw executorFailure("GitHub Copilot", String(data.message ?? ""));
    if (event.type === "result") {
      if (event.exitCode !== 0) throw executorFailure("GitHub Copilot", result.stderr);
      completed = true;
    }
    if (event.type !== "assistant.message" || event.agentId || data.parentToolCallId) continue;
    if (typeof data.model === "string" && data.model !== model)
      throw new UserError(
        "Copilot used a different model than selected.",
        "Choose an exact model identifier with maestrun init.",
      );
    if (typeof data.content === "string") text = data.content;
  }
  if (!completed || !text.trim()) throw outputError();
  return text;
}
