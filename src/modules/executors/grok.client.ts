import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Effort } from "../../contracts/workflow.js";
import type { TokenUsage } from "../../contracts/run.js";
import { runCommand } from "../../shared/process.js";
import { tokenUsageCollector } from "../../shared/token-usage.js";
import { generationOutput } from "./generation-output.js";
import { parseGrokOutput } from "./grok-output.js";

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
  resume?: boolean;
}>;

const GROK_RESTRICTIONS = [
  "--no-auto-update",
  "--no-subagents",
  "--no-memory",
  "--no-plan",
  "--no-ask-user",
  "--disable-web-search",
  "--deny",
  "mcp__*",
];

export function grokArguments(
  input: Pick<Input, "model" | "effort" | "execution" | "sessionId" | "resume">,
): readonly string[] {
  return [
    "--model",
    input.model,
    "--output-format",
    "streaming-messages-json",
    "--include-partial-messages",
    ...GROK_RESTRICTIONS,
    "--sandbox",
    input.execution ? "workspace" : "read-only",
    "--permission-mode",
    "dontAsk",
    "--tools",
    input.execution
      ? "read_file,list_dir,grep_search,search_replace,bash"
      : "read_file,list_dir,grep_search",
    ...(input.execution
      ? ["--allow", "Edit", "--allow", "Write", "--allow", "Bash"]
      : ["--deny", "Edit", "--deny", "Write", "--deny", "Bash"]),
    ...(input.effort ? ["--reasoning-effort", input.effort] : []),
    ...(input.sessionId ? [input.resume ? "--resume" : "--session-id", input.sessionId] : []),
  ];
}

export async function generateGrok(input: Input): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "maestrun-grok-"));
  try {
    const path = join(directory, "prompt.txt");
    await writeFile(path, input.prompt, { mode: 0o600 });
    return await runGrok(input, path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runGrok(input: Input, promptFile: string): Promise<string> {
  const output = generationOutput("grok", input.onOutput ?? (() => {}));
  const usage = tokenUsageCollector("grok", input.onUsage);
  const result = await runCommand({
    executable: "grok",
    args: [...grokArguments(input), "--prompt-file", promptFile],
    cwd: input.cwd,
    signal: input.signal,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    onStdoutLine: (line) => {
      output.onLine(line);
      usage.line(line);
    },
  });
  return parseGrokOutput({ ...result, stdout: output.result ?? "" }, input.model);
}
