import { executorFailure, UserError } from "../../shared/errors.js";
import { isRecord } from "../../contracts/workflow.js";
import type { Effort } from "../../contracts/workflow.js";
import { runCommand } from "../../shared/process.js";
import type { CommandResult } from "../../shared/process.js";
import { generationOutput } from "./generation-output.js";

export const CODEX_RESTRICTIONS = [
  "--config",
  "features.hooks=false",
  "--config",
  "features.apps=false",
  "--config",
  "features.plugins=false",
  "--config",
  "features.multi_agent=false",
  "--config",
  "features.goals=false",
  "--config",
  "features.memories=false",
] as const;

export function codexArguments(model: string, effort?: Effort): readonly string[] {
  return [
    "--ask-for-approval",
    "never",
    "exec",
    "--model",
    model,
    ...(effort ? ["--config", `model_reasoning_effort=${JSON.stringify(effort)}`] : []),
    "--sandbox",
    "read-only",
    "--json",
    "--color",
    "never",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    ...CODEX_RESTRICTIONS,
    "-",
  ];
}

type CodexOutput = {
  text: string;
  completed: boolean;
  failed: boolean;
  details: string;
};

function inspectEvent(output: CodexOutput, value: unknown, allowFileChanges: boolean): void {
  if (!isRecord(value)) throw new Error("Invalid event");
  if (value.type === "turn.completed") output.completed = true;
  if (value.type === "turn.failed") output.failed = true;
  if (value.type === "error" && typeof value.message === "string") output.details = value.message;
  if (value.type !== "item.completed" || !isRecord(value.item)) return;
  if (value.item.type === "file_change" && !allowFileChanges)
    throw new UserError(
      "Codex attempted a file change during planning.",
      "Update Codex and retry with its read-only sandbox.",
    );
  if (value.item.type === "agent_message" && typeof value.item.text === "string")
    output.text = value.item.text;
}

export function parseCodexOutput(result: CommandResult, allowFileChanges = false): string {
  const output: CodexOutput = {
    text: "",
    completed: false,
    failed: false,
    details: result.stderr,
  };
  try {
    for (const line of result.stdout.split("\n").filter((line) => line.trim())) {
      const value: unknown = JSON.parse(line);
      inspectEvent(output, value, allowFileChanges);
    }
  } catch (error) {
    if (error instanceof UserError) throw error;
    if (result.code !== 0) throw executorFailure("Codex", result.stderr);
    throw new UserError("Codex returned invalid output.", "Update Codex and retry the command.");
  }
  if (result.code !== 0 || output.failed) throw executorFailure("Codex", output.details);
  if (!output.completed || !output.text.trim())
    throw new UserError(
      "Codex did not return a completed response.",
      "Run maestrun init again with a supported model.",
    );
  return output.text;
}

export async function generateCodex(
  input: Readonly<{
    cwd: string;
    model: string;
    effort?: Effort;
    prompt: string;
    signal: AbortSignal;
    timeoutMs?: number | undefined;
    onOutput?: (text: string) => void;
  }>,
): Promise<string> {
  const result = await runCommand({
    executable: "codex",
    args: codexArguments(input.model, input.effort),
    cwd: input.cwd,
    input: input.prompt,
    signal: input.signal,
    ...(input.onOutput ? { onStdoutLine: generationOutput("codex", input.onOutput).onLine } : {}),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
  return parseCodexOutput(result);
}
