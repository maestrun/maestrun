import { configOptions } from "./config-options.js";
import {
  isBuiltinStage,
  isExecutor,
  isRecord,
  isStage,
  stageLabel,
  STAGES,
  validEffort,
  validModel,
  validStepFile,
} from "../contracts/workflow.js";
import type { Assignment, Config, Stage, Targets } from "../contracts/workflow.js";
import { UserError } from "../shared/errors.js";

function configError(): UserError {
  return new UserError(
    "The saved Maestrun configuration is invalid.",
    "Restore a valid .maestrun/config.json or move it aside, then run maestrun init again.",
  );
}

function parseAssignment(value: unknown): Assignment {
  if (
    !isRecord(value) ||
    !isExecutor(value.executor) ||
    !validModel(value.model) ||
    (value.executor === "copilot" && value.model === "auto") ||
    (value.effort !== undefined && !validEffort(value.effort, value.executor))
  )
    throw configError();
  return {
    executor: value.executor,
    model: value.model,
    ...(validEffort(value.effort, value.executor) ? { effort: value.effort } : {}),
  };
}

function parseStage(value: unknown): Stage {
  if (
    !isRecord(value) ||
    !isStage(value.id) ||
    (value.file !== undefined && (isBuiltinStage(value.id) || !validStepFile(value.file)))
  )
    throw configError();
  return {
    id: value.id,
    ...parseAssignment(value),
    ...(validStepFile(value.file) ? { file: value.file } : {}),
  };
}

function parseTargets(value: unknown): Targets {
  if (!isRecord(value)) throw configError();
  return { frontend: parseAssignment(value.frontend), backend: parseAssignment(value.backend) };
}

export function parseConfig(value: unknown): Config {
  if (!isRecord(value)) throw configError();
  if (value.version !== 1)
    throw new UserError(
      "This configuration version is unsupported.",
      "Use a compatible Maestrun version or move .maestrun/config.json aside.",
    );
  if (!Array.isArray(value.stages) || value.stages.length === 0) throw configError();
  const stages = value.stages.map(parseStage);
  const order = stages
    .map((stage) => stage.id)
    .filter(isBuiltinStage)
    .map((id) => STAGES.indexOf(id));
  const names = stages.map((stage) => stageLabel(stage.id).toLowerCase());
  if (
    stages[0]?.id !== "planning" ||
    new Set(names).size !== names.length ||
    order.some((index, position) => position > 0 && index <= (order[position - 1] ?? -1))
  )
    throw configError();
  return {
    ...configOptions(value),
    version: 1,
    stages,
    ...(value.targets !== undefined ? { targets: parseTargets(value.targets) } : {}),
  };
}
