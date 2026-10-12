import chalk from "chalk";
import { executorLabel, isExecutor, stageLabel } from "../../contracts/workflow.js";
import type {
  Assignment,
  Config,
  ExecutorStatus,
  Stage,
  StageId,
} from "../../contracts/workflow.js";
import { BackError } from "../../shared/errors.js";
import { statusLabel } from "../executors/index.js";
import { selectModelSettings } from "./model-step.js";
import type { WizardContext } from "./wizard.types.js";
import type { Choice } from "../../shared/ui.types.js";
import { initialAssignment } from "./preset-assignment.js";

type StageInput = Readonly<{
  context: WizardContext;
  ids: readonly StageId[];
  existing: Config | undefined;
}>;

function executorChoices(
  context: WizardContext,
  statuses: readonly ExecutorStatus[],
): readonly Choice[] {
  const installed = statuses.filter((status) => status.state !== "missing");
  if (!installed.length) {
    context.ui.log("No executors found on PATH. Install an executor, then check again.");
    for (const status of statuses) context.ui.log(status.nextAction);
  }
  for (const status of installed.filter((status) => status.state !== "ready"))
    context.ui.log(`${executorLabel(status.id)}: ${status.nextAction}`);
  return installed.map((status) => ({
    name: status.state === "ready" ? statusLabel(status) : executorLabel(status.id),
    value: status.id,
    ...(status.state !== "ready" ? { disabled: status.detail } : {}),
  }));
}

export async function selectExecutor(
  context: WizardContext,
  initial: Assignment,
): Promise<Assignment> {
  let statuses = await context.ui.progress("Checking executors…", () =>
    context.services.detect(context.cwd, context.signal),
  );
  while (true) {
    const choices = executorChoices(context, statuses);
    const ready =
      statuses.find((status) => status.id === initial.executor && status.state === "ready") ??
      statuses.find((status) => status.state === "ready");
    const selected = await context.ui.select(
      "Executor",
      [...choices, { name: "Check executors again", value: "refresh" }],
      ready?.id,
    );
    if (
      isExecutor(selected) &&
      statuses.some((status) => status.id === selected && status.state === "ready")
    )
      return {
        executor: selected,
        model: selected === initial.executor ? initial.model : "",
        ...(selected === initial.executor && initial.effort ? { effort: initial.effort } : {}),
      };
    statuses = await context.services.detect(context.cwd, context.signal);
  }
}

export async function selectAssignment(
  context: WizardContext,
  initial: Assignment,
): Promise<Assignment> {
  let assignment = initial;
  while (true) {
    assignment = await selectExecutor(context, assignment);
    try {
      return await selectModelSettings(context, assignment);
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}

async function individualAssignments(
  context: WizardContext,
  ids: readonly StageId[],
  existing: Config | undefined,
): Promise<Config> {
  const stages: Stage[] = [];
  let index = 0;
  while (index < ids.length) {
    const id = ids[index];
    if (!id) break;
    context.ui.log(
      `\n${chalk.bold(`${stageLabel(id)} (${index + 1}/${ids.length}) — executor, model and effort`)}\n`,
    );
    try {
      const assignment = await selectAssignment(
        context,
        stages[index] ?? initialAssignment(existing, id, context.stepPresets),
      );
      stages[index] = { id, ...assignment };
      index += 1;
    } catch (error) {
      if (!(error instanceof BackError) || index === 0) throw error;
      index -= 1;
    }
  }
  return { ...existing, version: 1, stages };
}

export async function assignStages(input: StageInput): Promise<Config> {
  const initial = initialAssignment(input.existing, "planning", input.context.stepPresets);
  const same = input.ids
    .map((id) => initialAssignment(input.existing, id, input.context.stepPresets))
    .every(
      (stage) =>
        stage.executor === initial.executor &&
        stage.model === initial.model &&
        stage.effort === initial.effort,
    );
  const shared =
    input.ids.length === 1 ||
    (await input.context.ui.confirm(
      "Use the same executor, model and effort for every stage?",
      same,
    ));
  if (!shared) return individualAssignments(input.context, input.ids, input.existing);
  input.context.ui.log(
    `\n${chalk.bold(`Select executor, model and effort for ${input.ids.length === 1 ? "planning" : "all stages"}.`)}\n`,
  );
  const assignment = await selectAssignment(input.context, initial);
  return {
    ...input.existing,
    version: 1,
    stages: input.ids.map((id) => ({ id, ...assignment })),
    ...(input.existing?.targets ? { targets: input.existing.targets } : {}),
  };
}
