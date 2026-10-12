import {
  isExecutor,
  isRecord,
  STAGES,
  stageLabel,
  validEffort,
  validModel,
  validStepName,
} from "../contracts/workflow.js";
import type { StageId, StepPreset } from "../contracts/workflow.js";
import { UserError } from "../shared/errors.js";

export function stepPresetId(name: string): StageId {
  return (
    STAGES.find(
      (id) => id === name.toLowerCase() || stageLabel(id).toLowerCase() === name.toLowerCase(),
    ) ?? `custom:${name}`
  );
}

function invalid(): never {
  throw new UserError(
    "Invalid stepPresets in ~/.maestrun/config.json.",
    "Use unique step names or objects with name and optional executor, model and effort. See the README.",
  );
}

function parsePreset(value: unknown): StepPreset {
  const entry = typeof value === "string" ? { name: value } : value;
  if (!isRecord(entry) || typeof entry.name !== "string") return invalid();
  const { name, executor, model, effort } = entry;
  if (
    Object.keys(entry).some((key) => !["name", "executor", "model", "effort"].includes(key)) ||
    (!STAGES.some((id) => id === name.toLowerCase()) && !validStepName(name)) ||
    (executor !== undefined && !isExecutor(executor)) ||
    (model !== undefined && (!validModel(model) || (executor === "copilot" && model === "auto"))) ||
    (effort !== undefined && !validEffort(effort, isExecutor(executor) ? executor : "codex"))
  )
    return invalid();
  return {
    name,
    ...(isExecutor(executor) ? { executor } : {}),
    ...(validModel(model) ? { model } : {}),
    ...(validEffort(effort, isExecutor(executor) ? executor : "codex") ? { effort } : {}),
  };
}

export function parseStepPresets(value: unknown): readonly StepPreset[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return invalid();
  const presets = value.map(parsePreset);
  const names = presets.map((preset) => stepPresetId(preset.name).toLowerCase());
  if (new Set(names).size !== names.length) return invalid();
  return presets;
}
