import {
  DEFAULT_STAGES,
  MAX_STEP_NAME_LENGTH,
  stageLabel,
  validStepName,
  workflowOrder,
} from "../../contracts/workflow.js";
import type { Config, StageId, StepFile, StepPreset } from "../../contracts/workflow.js";
import { stepPresetId } from "../../config/index.js";
import { BackError, UserError } from "../../shared/errors.js";
import { prepareStepFiles } from "./step-files.js";
import { ADD_CUSTOM_STEP, CREATE_STEP_FILES } from "../../shared/ui.types.js";
import type { StageAction } from "../../shared/ui.types.js";
import type { WizardContext } from "./wizard.types.js";

export type Workflow = Readonly<{
  selected: readonly StageId[];
  order: readonly StageId[];
  files?: readonly StepFile[];
}>;

export function initialWorkflow(
  saved: Config | undefined,
  presets: readonly StepPreset[] = [],
): Workflow {
  const selected = saved?.stages.map((stage) => stage.id) ?? DEFAULT_STAGES;
  const files =
    saved?.stages.flatMap((stage) => (stage.file ? [{ id: stage.id, path: stage.file }] : [])) ??
    [];
  const available = presets
    .map((preset) => stepPresetId(preset.name))
    .filter(
      (id) =>
        !selected.some(
          (selectedId) => stageLabel(selectedId).toLowerCase() === stageLabel(id).toLowerCase(),
        ),
    );
  return {
    selected,
    order: workflowOrder([...selected, ...available]),
    ...(files.length ? { files } : {}),
  };
}

async function customName(
  context: WizardContext,
  ids: readonly StageId[],
  initial: string,
): Promise<string> {
  let name = initial;
  while (true) {
    name = (await context.ui.input("Custom step name", name)).trim();
    if (!validStepName(name)) {
      context.ui.log(
        `Use 1–${MAX_STEP_NAME_LENGTH} characters without control characters. Built-in stage names are reserved.`,
      );
      continue;
    }
    if (ids.some((id) => stageLabel(id).toLowerCase() === name.toLowerCase())) {
      context.ui.log("A step with that name already exists. Choose another name.");
      continue;
    }
    return name;
  }
}

function validateOrder(ids: readonly StageId[], previous: readonly StageId[], step: StageId): void {
  const unchanged = ids.filter((id) => id !== step);
  if (
    ids[0] !== "planning" ||
    ids.length !== previous.length + 1 ||
    unchanged.length !== previous.length ||
    unchanged.some((id, index) => id !== previous[index])
  )
    throw new UserError("The selected step order is invalid.", "Move the new step after planning.");
}

async function addCustomStep(
  context: WizardContext,
  ids: readonly StageId[],
): Promise<readonly StageId[]> {
  let name = "";
  while (true) {
    name = await customName(context, ids, name);
    const id: StageId = `custom:${name}`;
    try {
      const ordered = await context.ui.orderStep([...ids, id], id);
      validateOrder(ordered, ids, id);
      return ordered;
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}

async function workflowAction(
  context: WizardContext,
  workflow: Workflow,
  action: StageAction,
): Promise<Workflow> {
  if (action === CREATE_STEP_FILES)
    return { ...workflow, files: await prepareStepFiles(context, workflow) };
  const order = await addCustomStep(context, workflow.order);
  return {
    ...workflow,
    order,
    selected: order.filter((id) => workflow.selected.includes(id) || !workflow.order.includes(id)),
  };
}

export async function selectWorkflow(
  context: WizardContext,
  initial: readonly StageId[],
  settings?: Pick<Workflow, "order" | "files">,
): Promise<Workflow> {
  let workflow: Workflow = {
    selected: initial,
    order: settings?.order ?? workflowOrder(initial),
    ...(settings?.files ? { files: settings.files } : {}),
  };
  while (true) {
    const choices = await context.ui.stages(workflow.selected, workflow.order);
    const selected = workflow.order.filter((id) => id === "planning" || choices.includes(id));
    workflow = { ...workflow, selected };
    const action = choices.find(
      (choice) => choice === ADD_CUSTOM_STEP || choice === CREATE_STEP_FILES,
    );
    if (!action) return workflow;
    try {
      workflow = await workflowAction(context, workflow, action);
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}
