import { EFFORTS, executorLabel, validEffort } from "../../contracts/workflow.js";
import type { Assignment, Effort, Model } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import type { Choice } from "../../shared/ui.types.js";
import type { WizardContext } from "./wizard.types.js";

function effortChoices(model: Model | undefined, efforts: readonly Effort[]): readonly Choice[] {
  return [
    {
      name: model?.defaultEffort ? `Default (${model.defaultEffort})` : "Default (native CLI)",
      value: "",
    },
    ...efforts.map((effort) => ({ name: effort, value: effort })),
  ];
}

export async function selectEffort(
  context: WizardContext & { effortLabel?: string },
  assignment: Assignment,
  model: Model | undefined,
): Promise<Effort | undefined> {
  const efforts =
    model?.efforts ?? EFFORTS.filter((effort) => validEffort(effort, assignment.executor));
  if (!efforts.length) {
    context.ui.log("This model does not support effort selection.");
    return undefined;
  }
  if (!model?.efforts) context.ui.log("Effort support is unverified for this model identifier.");
  const preferred =
    assignment.effort && efforts.includes(assignment.effort) ? assignment.effort : "";
  const selected = await context.ui.select(
    context.effortLabel ?? `${executorLabel(assignment.executor)} effort`,
    effortChoices(model, efforts),
    preferred,
  );
  if (!selected) return undefined;
  if (!validEffort(selected, assignment.executor) || !efforts.includes(selected))
    throw new UserError("The selected effort is unsupported.", "Choose a supported effort level.");
  return selected;
}
