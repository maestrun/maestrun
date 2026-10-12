import { isRecord } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import type { CommandResult } from "../../shared/process.js";

export function parseGrokOutput(result: CommandResult, model: string): string {
  if (result.code !== 0) throw executorFailure("Grok Build", result.stderr);
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new UserError("Grok Build returned invalid output.", "Run grok update and retry.");
  }
  if (!isRecord(value) || value.type !== "result")
    throw new UserError("Grok Build returned invalid output.", "Run grok update and retry.");
  if (value.is_error !== false || value.subtype !== "success")
    throw executorFailure("Grok Build", JSON.stringify(value.errors ?? ""));
  if (value.stop_reason !== "end_turn" || typeof value.result !== "string" || !value.result.trim())
    throw new UserError(
      "Grok Build did not return a completed response.",
      "Check the task and retry with a supported model.",
    );
  if (isRecord(value.modelUsage) && Object.keys(value.modelUsage).some((id) => id !== model))
    throw new UserError(
      "Grok Build used a different model than selected.",
      "Run grok models and choose an exact model identifier.",
    );
  return value.result;
}
