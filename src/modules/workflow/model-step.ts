import { executorLabel, validModel } from "../../contracts/workflow.js";
import type { Assignment, ExecutorId, Model } from "../../contracts/workflow.js";
import { selectEffort } from "./effort-step.js";
import { BackError, isCancellation, UserError } from "../../shared/errors.js";
import { isClaudeAlias } from "../executors/index.js";
import type { Choice } from "../../shared/ui.types.js";
import type { WizardContext } from "./wizard.types.js";

export async function availableModels(
  context: WizardContext,
  executor: ExecutorId,
): Promise<readonly Model[]> {
  try {
    return await context.ui.progress(`Discovering ${executorLabel(executor)} models…`, () =>
      context.catalog(executor),
    );
  } catch (error) {
    if (isCancellation(error)) throw error;
    context.ui.log(
      `${executorLabel(executor)} model discovery is unavailable. Enter an explicit identifier.`,
    );
    return [];
  }
}

async function manualModel(context: WizardContext, assignment: Assignment): Promise<string> {
  let model = assignment.model;
  while (true) {
    model = (await context.ui.input("Model identifier", model)).trim();
    if (!validModel(model)) {
      context.ui.log("Enter a nonempty model identifier without spaces.");
      continue;
    }
    if (assignment.executor === "copilot" && model === "auto") {
      context.ui.log("Enter an exact model identifier. Run copilot and use /model to find it.");
      continue;
    }
    if (assignment.executor === "claude" && isClaudeAlias(model)) {
      context.ui.log(
        "Enter a full identifier, not an alias. Run claude and use /model to find it.",
      );
      continue;
    }
    return model;
  }
}

function modelChoices(models: readonly Model[], assignment: Assignment): readonly Choice[] {
  const choices = models.map((model) => ({
    name: `${model.name} (${model.id})`,
    value: model.id,
  }));
  if (assignment.model && !models.some((model) => model.id === assignment.model))
    choices.unshift({
      name: `${assignment.model} (saved identifier)`,
      value: assignment.model,
    });
  choices.push({ name: "Enter an explicit model identifier", value: "" });
  return choices;
}

export async function selectModel(
  context: WizardContext,
  assignment: Assignment,
  catalog?: readonly Model[],
): Promise<string> {
  const models = catalog ?? (await availableModels(context, assignment.executor));
  if (!models.length) return manualModel(context, assignment);
  const preferred = assignment.model || models.find((model) => model.isDefault)?.id;
  const model = await context.ui.search(
    `${executorLabel(assignment.executor)} model (type to search)`,
    modelChoices(models, assignment),
    preferred,
  );
  if (!model) return manualModel(context, assignment);
  if (
    !validModel(model) ||
    (assignment.executor === "copilot" && model === "auto") ||
    (assignment.executor === "claude" && isClaudeAlias(model))
  )
    throw new UserError(
      "The selected model identifier is invalid.",
      "Enter an explicit model identifier.",
    );
  return model;
}

export async function selectModelSettings(
  context: WizardContext,
  initial: Assignment,
): Promise<Assignment> {
  const models = await availableModels(context, initial.executor);
  let assignment = initial;
  while (true) {
    const model = await selectModel(context, assignment, models);
    assignment = {
      executor: assignment.executor,
      model,
      ...((!assignment.model || model === assignment.model) && assignment.effort
        ? { effort: assignment.effort }
        : {}),
    };
    const selectedModel = models.find((entry) => entry.id === model);
    try {
      const effort = await selectEffort(context, assignment, selectedModel);
      return { executor: assignment.executor, model, ...(effort ? { effort } : {}) };
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}
