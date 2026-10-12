import { stepPresetId } from "../../config/index.js";
import { validEffort } from "../../contracts/workflow.js";
import type { Assignment, Config, StageId, StepPreset } from "../../contracts/workflow.js";

export function initialAssignment(
  existing: Config | undefined,
  id: StageId,
  presets: readonly StepPreset[] = [],
): Assignment {
  const saved = existing?.stages.find((stage) => stage.id === id);
  if (saved) return saved;
  const fallback: Assignment = existing?.stages[0] ?? { executor: "codex", model: "" };
  const preset = presets.find(
    (entry) => stepPresetId(entry.name).toLowerCase() === id.toLowerCase(),
  );
  if (!preset) return fallback;
  const executor = preset.executor ?? fallback.executor;
  const model = preset.model ?? (executor === fallback.executor ? fallback.model : "");
  const effort =
    preset.effort ??
    (executor === fallback.executor && model === fallback.model ? fallback.effort : undefined);
  return { executor, model, ...(validEffort(effort, executor) ? { effort } : {}) };
}
