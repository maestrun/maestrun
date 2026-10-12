import { stripVTControlCharacters } from "node:util";
import { validModel } from "../../contracts/workflow.js";
import type { ExecutorStatus, Model } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import { runCommand } from "../../shared/process.js";
import type { CommandResult } from "../../shared/process.js";

export function grokAuthState(result: CommandResult): ExecutorStatus["state"] {
  const text = stripVTControlCharacters(`${result.stdout}\n${result.stderr}`);
  if (/not authenticated|unauthorized|\b401\b|run [`']?grok login/iu.test(text))
    return "unauthenticated";
  if (result.code !== 0) return "unknown";
  return /You are (logged in with .+|using XAI_API_KEY|authenticated via deployment key)\.|Model '.+' is using its own API key\./u.test(
    text,
  )
    ? "ready"
    : "unknown";
}

export function parseGrokModels(stdout: string): readonly Model[] {
  const text = stripVTControlCharacters(stdout).replace(/\r\n/gu, "\n");
  const catalog = text.split("Available models:\n")[1];
  if (!catalog)
    throw new UserError(
      "Grok Build returned an invalid model catalog.",
      "Run grok models or enter an exact model identifier.",
    );
  const models = new Map<string, Model>();
  for (const line of catalog.split("\n").filter((line) => line.trim())) {
    const match = /^\s+[*-] (\S+?)( \(default\))?\s*$/u.exec(line);
    const id = match?.[1];
    if (!validModel(id))
      throw new UserError(
        "Grok Build returned an invalid model catalog.",
        "Run grok models or enter an exact model identifier.",
      );
    models.set(id, { id, name: id, isDefault: Boolean(match?.[2]) });
  }
  return [...models.values()];
}

export async function discoverGrokModels(
  cwd: string,
  signal: AbortSignal,
): Promise<readonly Model[]> {
  const result = await runCommand({
    executable: "grok",
    args: ["models"],
    cwd,
    signal,
    timeoutMs: 10000,
  });
  if (grokAuthState(result) === "unauthenticated")
    throw executorFailure("Grok Build", "authentication required");
  if (result.code !== 0) throw executorFailure("Grok Build", result.stderr);
  return parseGrokModels(result.stdout);
}
