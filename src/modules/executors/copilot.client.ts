import type { Effort } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { runCommand } from "../../shared/process.js";
import type { CommandResult } from "../../shared/process.js";
import { parseCopilotOutput } from "./copilot-output.js";
import { generationOutput } from "./generation-output.js";
import type { TokenUsage } from "../../contracts/run.js";
import { tokenUsageCollector } from "../../shared/token-usage.js";

type Input = Readonly<{
  cwd: string;
  model: string;
  effort?: Effort;
  prompt: string;
  signal: AbortSignal;
  timeoutMs?: number | undefined;
  onOutput?: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  execution?: boolean;
  sessionId?: string;
}>;

export function copilotArguments(
  model: string,
  effort?: Effort,
  execution = false,
): readonly string[] {
  if (model === "auto")
    throw new UserError(
      "Copilot requires an exact model identifier.",
      "Run copilot and use /model, then run maestrun init.",
    );
  return [
    "--model",
    model,
    "--output-format",
    "json",
    "--stream",
    "off",
    "--no-ask-user",
    "--no-color",
    "--no-auto-update",
    "--no-remote-export",
    "--disable-builtin-mcps",
    `--available-tools=${execution ? "view,glob,grep,create,edit,bash,read_bash,list_bash,stop_bash" : "view,glob,grep"}`,
    ...(execution
      ? ["--allow-tool=write,shell"]
      : ["--no-custom-instructions", "--deny-tool=write,shell"]),
    ...(effort ? ["--reasoning-effort", effort] : []),
  ];
}

export function copilotEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    COPILOT_ALLOW_ALL: "false",
    GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: "false",
  };
}

export async function generateCopilot(input: Input): Promise<string> {
  const usage = tokenUsageCollector("copilot", input.onUsage);
  const output = input.onOutput ? generationOutput("copilot", input.onOutput) : undefined;
  const result: CommandResult = await runCommand({
    executable: "copilot",
    args: [
      ...copilotArguments(input.model, input.effort, input.execution),
      ...(input.sessionId ? ["--session-id", input.sessionId] : []),
    ],
    cwd: input.cwd,
    input: input.prompt,
    signal: input.signal,
    env: copilotEnvironment(),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    onStdoutLine: (line) => {
      usage.line(line);
      output?.onLine(line);
    },
  });
  return parseCopilotOutput(result, input.model);
}
