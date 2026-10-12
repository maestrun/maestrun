import { EXECUTORS, executorLabel, isRecord } from "../../contracts/workflow.js";
import type { ExecutorId, ExecutorStatus } from "../../contracts/workflow.js";
import { isCancellation } from "../../shared/errors.js";
import { runCommand } from "../../shared/process.js";
import type { Command } from "../../shared/process.js";
import { copilotRequest } from "./copilot-rpc.client.js";
import { grokAuthState } from "./grok-models.client.js";

const DETECTION_TIMEOUT_MS = 10000;
const REQUIRED_FLAGS = {
  grok: [
    "--prompt-file",
    "--sandbox",
    "--tools",
    "--deny",
    "--permission-mode",
    "streaming-messages-json",
    "--include-partial-messages",
    "--reasoning-effort",
    "--session-id",
    "--resume",
  ],
  codex: ["--sandbox", "--json", "--ephemeral", "--ignore-user-config", "--ignore-rules"],
  copilot: [
    "--available-tools",
    "--deny-tool",
    "--output-format",
    "--no-ask-user",
    "--session-id",
    "--reasoning-effort",
    "--no-remote-export",
  ],
  claude: [
    "--tools",
    "--restricted",
    "--safe-mode",
    "--permission-prompts",
    "--strict-mcp-config",
    "--no-session-persistence",
  ],
} as const;

function status(id: ExecutorId, state: ExecutorStatus["state"]): ExecutorStatus {
  const messages = {
    ready: ["Ready", ""],
    missing: [
      "Not installed or not on PATH",
      {
        codex: "Install Codex: npm install -g @openai/codex",
        claude: "Install Claude Code: https://code.claude.com/docs/en/setup",
        copilot: "Install Copilot: npm install -g @github/copilot",
        grok: "Install Grok Build: npm install -g @xai-official/grok",
      }[id],
    ],
    unauthenticated: [
      "Authentication required",
      id === "claude" ? "Run claude auth login" : `Run ${id} login`,
    ],
    incompatible: ["Installed version lacks required planning controls", `Run ${id} update`],
    unknown: [
      "Could not check executor status",
      `Run ${id} --version and check your executor installation`,
    ],
  } as const;
  const [detail, nextAction] = messages[state];
  return { id, state, detail, nextAction };
}

function claudeAuthenticated(output: string): boolean | undefined {
  try {
    const value: unknown = JSON.parse(output);
    return isRecord(value) && typeof value.loggedIn === "boolean" ? value.loggedIn : undefined;
  } catch {
    return undefined;
  }
}

async function authStatus(id: ExecutorId, base: Omit<Command, "args">): Promise<ExecutorStatus> {
  if (id === "grok")
    return status(id, grokAuthState(await runCommand({ ...base, args: ["models"] })));
  if (id === "copilot") {
    const value = await copilotRequest("auth.getStatus", {
      cwd: base.cwd,
      signal: base.signal ?? new AbortController().signal,
    });
    return status(
      id,
      !isRecord(value) || typeof value.isAuthenticated !== "boolean"
        ? "unknown"
        : value.isAuthenticated
          ? "ready"
          : "unauthenticated",
    );
  }
  const auth = await runCommand({
    ...base,
    args: id === "codex" ? ["login", "status"] : ["auth", "status", "--json"],
  });
  if (auth.code !== 0) return status(id, "unauthenticated");
  if (id === "codex") return status(id, "ready");
  const loggedIn = claudeAuthenticated(auth.stdout);
  return status(id, loggedIn === undefined ? "unknown" : loggedIn ? "ready" : "unauthenticated");
}

export async function detectExecutor(
  input: Readonly<{ id: ExecutorId; cwd: string; signal: AbortSignal }>,
): Promise<ExecutorStatus> {
  const base = {
    executable: input.id,
    cwd: input.cwd,
    signal: input.signal,
    timeoutMs: DETECTION_TIMEOUT_MS,
  };
  try {
    const version = await runCommand({ ...base, args: ["--version"] });
    if (version.code !== 0) return status(input.id, "unknown");
    const help = await runCommand({
      ...base,
      args: input.id === "codex" ? ["exec", "--help"] : ["--help"],
    });
    if (help.code !== 0 || REQUIRED_FLAGS[input.id].some((flag) => !help.stdout.includes(flag)))
      return status(input.id, "incompatible");
    return await authStatus(input.id, base);
  } catch (error) {
    if (isCancellation(error)) throw error;
    return status(
      input.id,
      error instanceof Error && error.message.startsWith("Could not start") ? "missing" : "unknown",
    );
  }
}

export async function detectExecutors(
  cwd: string,
  signal: AbortSignal,
): Promise<readonly ExecutorStatus[]> {
  return Promise.all(EXECUTORS.map((id) => detectExecutor({ id, cwd, signal })));
}

export function statusLabel(value: ExecutorStatus): string {
  return `${executorLabel(value.id)} — ${value.detail}`;
}
