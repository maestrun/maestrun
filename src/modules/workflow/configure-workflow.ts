import chalk from "chalk";
import {
  loadGlobalConfig,
  mergeConfig,
  parseConfig,
  parseStepPresets,
} from "../../config/index.js";
import { selectTargets } from "./target-step.js";
import { assignStages } from "./assignments.js";
import type { Config, ExecutorId, Model, Setup, StepFile } from "../../contracts/workflow.js";
import { selectExecution } from "./execution-step.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { discoverModels, detectExecutors } from "../executors/index.js";
import type { CommandInput } from "../../shared/command.types.js";
import type { WizardContext, WizardServices } from "./wizard.types.js";
import { initialWorkflow, selectWorkflow } from "./workflow-step.js";
import type { Workflow } from "./workflow-step.js";

type WizardInput = CommandInput & Readonly<{ saved: Config | undefined; adjusting?: boolean }>;
type State = {
  step: number;
  workflow: Workflow;
  config: Config | undefined;
};
const DEFAULT_SERVICES: WizardServices = {
  detect: detectExecutors,
  models: discoverModels,
};

export async function createContext(
  input: WizardInput,
  services: WizardServices,
): Promise<WizardContext> {
  const catalogs = new Map<ExecutorId, Promise<readonly Model[]>>();
  return {
    ...input,
    services,
    stepPresets: parseStepPresets((await loadGlobalConfig()).stepPresets),
    catalog: (executor) => {
      const catalog = catalogs.get(executor) ?? services.models(executor, input.cwd, input.signal);
      catalogs.set(executor, catalog);
      return catalog;
    },
  };
}

async function firstStep(input: WizardInput): Promise<number> {
  if (!input.saved) return 0;
  try {
    const action = await input.ui.select(
      "Saved workflow found",
      [
        { name: "Keep the saved workflow and exit", value: "reuse" },
        { name: "Adjust workflow settings", value: "adjust" },
      ],
      "adjust",
    );
    return action === "reuse" ? 4 : 0;
  } catch (error) {
    if (!(error instanceof BackError)) throw error;
    throw new CancelError();
  }
}

async function advance(state: State, context: WizardContext): Promise<Setup | undefined> {
  if (state.step === 4) return setupFromState(state);
  logStep(state.step, context);
  const steps = [
    async (): Promise<void> => {
      state.workflow = await selectWorkflow(context, state.workflow.selected, state.workflow);
    },
    async (): Promise<void> => {
      state.config = withStepFiles(
        await assignStages({
          context,
          ids: state.workflow.selected,
          existing: state.config,
        }),
        state.workflow.files,
      );
    },
    async (): Promise<void> => {
      state.config = await selectTargets(context, requireConfig(state));
    },
    async (): Promise<void> => {
      state.config = await executionSettings(context, requireConfig(state));
    },
  ];
  const step = steps[state.step];
  if (!step) throw new Error("Invalid wizard step");
  await step();
  state.step += 1;
  return undefined;
}

async function executionSettings(context: WizardContext, config: Config): Promise<Config> {
  return selectExecution(context.ui, parseConfig(mergeConfig(await loadGlobalConfig(), config)));
}

function requireConfig(state: State): Config {
  if (!state.config) throw new Error("Missing stage assignments");
  return state.config;
}

function setupFromState(state: State): Setup {
  return {
    config: requireConfig(state),
    ...(state.workflow.files ? { files: state.workflow.files } : {}),
  };
}

function withStepFiles(config: Config, files: readonly StepFile[] = []): Config {
  return {
    ...config,
    stages: config.stages.map((stage) => {
      const file = files.find((entry) => entry.id === stage.id)?.path;
      return { ...stage, ...(file ? { file } : {}) };
    }),
  };
}

export async function runWizard(
  input: WizardInput,
  services: WizardServices = DEFAULT_SERVICES,
): Promise<Setup> {
  const context = await createContext(input, services);
  const state: State = {
    step: input.adjusting ? 0 : await firstStep(input),
    workflow: initialWorkflow(input.saved, context.stepPresets),
    config: input.saved,
  };
  input.ui.log("Use Esc or ← Back to return; Ctrl+C or Cancel to exit.");
  while (true) {
    try {
      const setup = await advance(state, context);
      if (setup) return setup;
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
      if (state.step === 0) throw new CancelError();
      state.step -= 1;
    }
  }
}

function logStep(step: number, context: WizardContext): void {
  context.ui.log(
    `\n${chalk.bold(`Step ${step + 1}/4 — ${["Workflow", "Executors and models", "Advanced mode", "Execution"][step]}`)}\n`,
  );
}
