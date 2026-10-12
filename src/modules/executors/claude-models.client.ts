import { isRecord, validEffort, validModel } from "../../contracts/workflow.js";
import type { Effort, Model } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import { runCommand } from "../../shared/process.js";
import { CLAUDE_RESTRICTIONS, isClaudeAlias } from "./claude.client.js";

const REQUEST_ID = "maestrun-models";
const CATALOG_ARGUMENTS = [
  ...CLAUDE_RESTRICTIONS,
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--settings",
  JSON.stringify({ disableAllHooks: true }),
];

function modelError(): UserError {
  return new UserError(
    "Claude Code returned an invalid model catalog.",
    "Update Claude Code or enter an explicit model identifier.",
  );
}

function parseEffort(value: unknown): Effort {
  if (!validEffort(value, "claude")) throw modelError();
  return value;
}

function parseModel(value: unknown): Model | undefined {
  if (!isRecord(value) || !validModel(value.value) || typeof value.displayName !== "string")
    throw modelError();
  const id = value.resolvedModel ?? value.value;
  if (!validModel(id)) throw modelError();
  if (isClaudeAlias(id)) return undefined;
  if (value.supportedEffortLevels !== undefined && !Array.isArray(value.supportedEffortLevels))
    throw modelError();
  const efforts = Array.isArray(value.supportedEffortLevels)
    ? value.supportedEffortLevels.map(parseEffort)
    : value.supportsEffort === true
      ? undefined
      : [];
  return {
    id,
    name: value.displayName,
    isDefault: value.value === "default",
    ...(efforts ? { efforts } : {}),
  };
}

function parseCatalog(value: unknown): readonly Model[] {
  if (!isRecord(value) || !Array.isArray(value.models)) throw modelError();
  const models = new Map<string, Model>();
  for (const entry of value.models) {
    const model = parseModel(entry);
    if (!model) continue;
    models.set(model.id, {
      ...model,
      isDefault: model.isDefault || models.get(model.id)?.isDefault === true,
    });
  }
  return [...models.values()];
}

function parseOutput(stdout: string): readonly Model[] {
  try {
    for (const line of stdout.split("\n").filter((line) => line.trim())) {
      const value: unknown = JSON.parse(line);
      if (!isRecord(value) || value.type !== "control_response") continue;
      const response = value.response;
      if (!isRecord(response) || response.request_id !== REQUEST_ID) continue;
      if (response.subtype !== "success") throw modelError();
      return parseCatalog(response.response);
    }
  } catch {
    throw modelError();
  }
  throw modelError();
}

export async function discoverClaudeModels(
  cwd: string,
  signal: AbortSignal,
): Promise<readonly Model[]> {
  const result = await runCommand({
    executable: "claude",
    args: CATALOG_ARGUMENTS,
    cwd,
    signal,
    timeoutMs: 10000,
    input: `${JSON.stringify({
      type: "control_request",
      request_id: REQUEST_ID,
      request: { subtype: "initialize" },
    })}\n`,
  });
  if (result.code !== 0) throw executorFailure("Claude Code", result.stderr);
  return parseOutput(result.stdout);
}
