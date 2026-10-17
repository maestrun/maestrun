import { DEFAULT_STAGES } from "../../contracts/workflow.js";
import type { Assignment, Config, Setup } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { detectExecutors, discoverModels } from "../executors/index.js";
import { selectExecutor } from "./assignments.js";
import { configTable } from "./config-table.js";
import { createContext, runWizard } from "./configure-workflow.js";
import { selectModel } from "./model-step.js";
import { orchestratedExecution } from "./execution-step.js";
import type { WizardServices } from "./wizard.types.js";

export async function runQuickWizard(
  input: CommandInput & { saved: Config | undefined },
  services: WizardServices = { detect: detectExecutors, models: discoverModels },
): Promise<Setup> {
  if (input.saved) return savedQuickSetup({ ...input, saved: input.saved }, services);
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
  const mode = await input.ui.select(
    "Workflow",
    [
      { name: "Standard — Planning → Implementation → Tests", value: "standard" },
      { name: "Orchestrator — coordinate tasks from a plan or prompt file", value: "orchestrator" },
      { name: "Customize — stages, effort, targets and parallel execution", value: "custom" },
    ],
    "standard",
  );
  const config: Config = {
    version: 1,
    stages: DEFAULT_STAGES.filter((id) => mode !== "orchestrator" || id === "planning").map(
      (id) => ({ id, ...assignment }),
    ),
    execution: { mode: "sequential", concurrency: 1, background: false },
    plugins: [],
  };
  const setup = await quickSetup(input, config, { mode, services });
  input.ui.log(configTable(setup.config));
  if (!(await input.ui.confirm("Save this workflow?", true))) return undefined;
  if (input.signal.aborted) throw new CancelError();
  return setup;
}

async function quickSetup(
  input: CommandInput,
  config: Config,
  options: { mode: string; services: WizardServices },
): Promise<Setup> {
  if (options.mode === "custom")
    return runWizard({ ...input, saved: config, adjusting: true }, options.services);
  if (options.mode === "orchestrator")
    return {
      config: await orchestratedExecution(
        input.ui,
        {
          ...config,
          execution: {
            ...config.execution,
            mode: config.execution?.mode ?? "sequential",
            concurrency: Math.max(2, config.execution?.concurrency ?? 2),
          },
        },
        "agent",
      ),
      prepareOrchestratorPlan: true,
    };
  return { config };
}

async function savedQuickSetup(
  input: CommandInput & { saved: Config },
  services: WizardServices,
): Promise<Setup> {
  try {
    const mode = await input.ui.select(
      "Saved workflow found",
      [
        { name: "Keep the saved workflow and exit", value: "reuse" },
        { name: "Adjust workflow settings", value: "custom" },
        { name: "Orchestrator — use saved stages and models", value: "orchestrator" },
      ],
      "custom",
    );
    if (mode === "reuse") return { config: input.saved };
    const setup = await quickSetup(input, input.saved, { mode, services });
    if (mode === "orchestrator") {
      input.ui.log(configTable(setup.config));
      if (!(await input.ui.confirm("Save this workflow?", true))) throw new CancelError();
    }
    return setup;
  } catch (error) {
    if (error instanceof BackError) throw new CancelError();
    throw error;
  }
}
