import { isRecord, validEffort, validModel } from "../../contracts/workflow.js";
import type { Model } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { copilotRequest } from "./copilot-rpc.client.js";

function modelError(): UserError {
  return new UserError(
    "Copilot returned an invalid model catalog.",
    "Run copilot update or enter an exact model identifier.",
  );
}

function parseModel(value: unknown): Model {
  if (!isRecord(value) || !validModel(value.id) || typeof value.name !== "string")
    throw modelError();
  const levels = value.supportedReasoningEfforts;
  if (levels !== undefined && !Array.isArray(levels)) throw modelError();
  const efforts = (levels ?? []).map((level: unknown) => {
    if (!validEffort(level, "copilot")) throw modelError();
    return level;
  });
  const defaultEffort = value.defaultReasoningEffort;
  if (
    defaultEffort !== undefined &&
    (!validEffort(defaultEffort, "copilot") || !efforts.includes(defaultEffort))
  )
    throw modelError();
  return {
    id: value.id,
    name: value.name,
    isDefault: false,
    efforts,
    ...(validEffort(defaultEffort, "copilot") ? { defaultEffort } : {}),
  };
}

export async function discoverCopilotModels(
  cwd: string,
  signal: AbortSignal,
): Promise<readonly Model[]> {
  const value = await copilotRequest("models.list", { cwd, signal });
  if (!isRecord(value) || !Array.isArray(value.models)) throw modelError();
  return value.models
    .filter(
      (model: unknown) =>
        !(
          isRecord(model) &&
          (model.id === "auto" || (isRecord(model.policy) && model.policy.state === "disabled"))
        ),
    )
    .map(parseModel);
}
