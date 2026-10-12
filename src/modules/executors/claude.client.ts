import { isRecord } from "../../contracts/workflow.js";
import type { Effort } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import { runCommand } from "../../shared/process.js";
import type { CommandResult } from "../../shared/process.js";
import { generationOutput } from "./generation-output.js";

const MODEL_ALIASES = new Set(["default", "best", "opusplan", "opus", "sonnet", "haiku", "fable"]);

export function isClaudeAlias(model: string): boolean {
  return MODEL_ALIASES.has(model.replace(/\[1m\]$/u, ""));
}

export const CLAUDE_RESTRICTIONS = [
  "--print",
  "--permission-mode",
  "plan",
  "--permission-prompts",
  "none",
  "--tools",
  "Read,Glob,Grep",
  "--allowedTools",
  "Read,Glob,Grep",
  "--disallowedTools",
  "mcp__*",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--no-session-persistence",
  "--disable-slash-commands",
  "--no-chrome",
  "--safe-mode",
  "--restricted",
] as const;

export function claudeArguments(
  model: string,
  effort?: Effort,
  streaming = false,
): readonly string[] {
  return [
    "--model",
    model,
    "--output-format",
    streaming ? "stream-json" : "json",
    ...(streaming ? ["--verbose", "--include-partial-messages"] : []),
    ...(effort ? ["--effort", effort] : []),
    ...CLAUDE_RESTRICTIONS,
    "--settings",
    JSON.stringify({
      disableAllHooks: true,
      switchModelsOnFlag: false,
      availableModels: [model],
      fallbackModel: [],
    }),
  ];
}

export function parseClaudeOutput(result: CommandResult, model: string): string {
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    if (result.code !== 0) throw executorFailure("Claude Code", result.stderr);
    throw new UserError(
      "Claude Code returned invalid output.",
      "Update Claude Code and retry the command.",
    );
  }
  if (!isRecord(value))
    throw new UserError("Claude Code returned invalid output.", "Update Claude Code and retry.");
  if (result.code !== 0 || value.is_error !== false || value.subtype !== "success")
    throw executorFailure(
      "Claude Code",
      `${result.stderr}\n${typeof value.result === "string" ? value.result : ""}`,
    );
  checkSelectedModel(value, model);
  if (typeof value.result !== "string" || !value.result.trim())
    throw new UserError(
      "Claude Code returned an empty response.",
      "Run maestrun init again with a supported model.",
    );
  return value.result;
}

function checkSelectedModel(value: Record<string, unknown>, model: string): void {
  if (
    isRecord(value.modelUsage) &&
    Object.keys(value.modelUsage).some((id) => id !== model.replace(/\[1m\]$/u, ""))
  )
    throw new UserError(
      "Claude Code used a different model than selected.",
      "Choose an explicit model identifier and check executor model restrictions.",
    );
}

export async function generateClaude(
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
  if (isClaudeAlias(input.model))
    throw new UserError(
      "Claude Code requires an explicit model identifier.",
      "Run claude and use /model to find the full identifier, then maestrun init again.",
    );
  const output = input.onOutput ? generationOutput("claude", input.onOutput) : undefined;
  const result = await runCommand({
    executable: "claude",
    args: claudeArguments(input.model, input.effort, Boolean(output)),
    cwd: input.cwd,
    input: input.prompt,
    signal: input.signal,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    env: claudeEnvironment(input.effort),
    ...(output ? { onStdoutLine: output.onLine } : {}),
  });
  return parseClaudeOutput({ ...result, stdout: output?.result ?? result.stdout }, input.model);
}

export function claudeEnvironment(effort?: Effort): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLAUDECODE: undefined,
    ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {}),
  };
}
