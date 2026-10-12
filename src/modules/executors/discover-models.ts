import { isRecord, validEffort, validModel } from "../../contracts/workflow.js";
import type { Effort, ExecutorId, Model } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { killProcess, monitorProcess, startProcess } from "../../shared/process.js";
import { CODEX_RESTRICTIONS } from "./codex.client.js";
import { discoverCopilotModels } from "./copilot-models.client.js";
import { discoverClaudeModels } from "./claude-models.client.js";
import { discoverGrokModels } from "./grok-models.client.js";
import { connectRpc } from "./rpc.client.js";
import type { Rpc } from "./rpc.client.js";

function modelError(): UserError {
  return new UserError(
    "Codex returned an invalid model catalog.",
    "Update Codex or enter an explicit model identifier.",
  );
}

function parseModel(value: unknown): Model {
  if (!isRecord(value) || !validModel(value.model) || typeof value.displayName !== "string")
    throw modelError();
  return {
    id: value.model,
    name: value.displayName,
    isDefault: value.isDefault === true,
    ...parseEfforts(value),
  };
}

function parseEffort(value: unknown): Effort {
  if (!isRecord(value) || !validEffort(value.reasoningEffort, "codex")) throw modelError();
  return value.reasoningEffort;
}

function parseEfforts(value: Record<string, unknown>): Pick<Model, "efforts" | "defaultEffort"> {
  if (value.supportedReasoningEfforts === undefined) return {};
  if (!Array.isArray(value.supportedReasoningEfforts)) throw modelError();
  const efforts = value.supportedReasoningEfforts.map(parseEffort);
  if (value.defaultReasoningEffort === undefined) return { efforts };
  if (
    !validEffort(value.defaultReasoningEffort, "codex") ||
    !efforts.includes(value.defaultReasoningEffort)
  )
    throw modelError();
  return { efforts, defaultEffort: value.defaultReasoningEffort };
}

async function readCatalog(rpc: Rpc): Promise<readonly Model[]> {
  const models = new Map<string, Model>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await rpc.request("model/list", {
      limit: 100,
      includeHidden: false,
      ...(cursor ? { cursor } : {}),
    });
    if (!isRecord(page) || !Array.isArray(page.data)) throw modelError();
    for (const model of page.data.map(parseModel)) models.set(model.id, model);
    if (
      page.nextCursor !== null &&
      page.nextCursor !== undefined &&
      typeof page.nextCursor !== "string"
    )
      throw modelError();
    cursor = typeof page.nextCursor === "string" ? page.nextCursor : null;
    if (cursor && cursors.has(cursor)) throw modelError();
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...models.values()];
}

export async function discoverCodexModels(
  cwd: string,
  signal: AbortSignal,
): Promise<readonly Model[]> {
  const command = {
    executable: "codex",
    args: ["app-server", "--listen", "stdio://", ...CODEX_RESTRICTIONS],
    cwd,
    signal,
    timeoutMs: 10000,
  };
  const child = startProcess(command);
  const rpc = connectRpc(child);
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  const cleanup = monitorProcess(child, command, rpc.fail);
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "maestrun", title: "Maestrun", version: "0.1.0" },
    });
    rpc.notify("initialized");
    return await readCatalog(rpc);
  } finally {
    rpc.close();
    killProcess(child, "SIGKILL");
    await closed;
    cleanup();
  }
}

export function discoverModels(
  executor: ExecutorId,
  cwd: string,
  signal: AbortSignal,
): Promise<readonly Model[]> {
  if (executor === "grok") return discoverGrokModels(cwd, signal);
  if (executor === "copilot") return discoverCopilotModels(cwd, signal);
  return executor === "codex"
    ? discoverCodexModels(cwd, signal)
    : discoverClaudeModels(cwd, signal);
}
