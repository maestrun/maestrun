import { DEFAULT_STAGES } from "../../contracts/workflow.js";
import type { Assignment, Config, Setup } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { detectExecutors, discoverModels } from "../executors/index.js";
import { selectExecutor } from "./assignments.js";
import { configTable } from "./config-table.js";
import { createContext, runWizard } from "./configure-workflow.js";
import { selectModel } from "./model-step.js";
import type { WizardServices } from "./wizard.types.js";

export async function runQuickWizard(
  input: CommandInput & { saved: Config | undefined },
  services: WizardServices = { detect: detectExecutors, models: discoverModels },
): Promise<Setup> {
  const context = await createContext(input, services);
  let assignment: Assignment = { executor: "codex", model: "" };
  let step = 0;
  while (true) {
    try {
      if (step === 0) assignment = await selectExecutor(context, assignment);
      if (step === 1) assignment = { ...assignment, model: await selectModel(context, assignment) };
      if (step < 2) {
        step += 1;
        continue;
      }
      const setup = await reviewQuickSetup(input, assignment, services);
      if (setup) return setup;
      step = 1;
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
      if (step === 0) throw new CancelError();
      step -= 1;
    }
  }
}

async function reviewQuickSetup(
  input: CommandInput,
  assignment: Assignment,
  services: WizardServices,
): Promise<Setup | undefined> {
  const config: Config = {
    version: 1,
    stages: DEFAULT_STAGES.map((id) => ({ id, ...assignment })),
    execution: { mode: "sequential", concurrency: 1, background: false },
    plugins: [],
  };
  const mode = await input.ui.select(
    "Workflow",
    [
      { name: "Standard — Planning → Implementation → Tests", value: "standard" },
      { name: "Customize — stages, effort, targets and parallel execution", value: "custom" },
    ],
    "standard",
  );
  const setup =
    mode === "custom"
      ? await runWizard({ ...input, saved: config, adjusting: true }, services)
      : { config };
  input.ui.log(configTable(setup.config));
  if (!(await input.ui.confirm("Save this workflow?", true))) return undefined;
  if (input.signal.aborted) throw new CancelError();
  return setup;
}
