import { join } from "node:path";
import { loadConfig, saveConfig } from "../../config/index.js";
import { CancelError } from "../../shared/errors.js";
import { saveStepFiles } from "./step-files.js";
import { runWizard } from "./configure-workflow.js";
import { runQuickWizard } from "./quick-wizard.js";
import type { CommandInput } from "../../shared/command.types.js";
import type { Setup } from "../../contracts/workflow.js";

export async function initialize(
  input: CommandInput & { quick?: boolean },
  services: Readonly<{ wizard: typeof runWizard }> = { wizard: runWizard },
): Promise<Setup> {
  const saved = await loadConfig(input.cwd);
  const wizard = input.quick ? runQuickWizard : services.wizard;
  const setup = await wizard({ ...input, saved: saved.config });
  if (input.signal.aborted) throw new CancelError();
  await saveStepFiles(input.cwd, setup.files ?? [], input.signal);
  if (input.signal.aborted) throw new CancelError();
  await saveConfig(input.cwd, setup.config, saved.snapshot);
  for (const file of setup.files ?? [])
    if (file.content !== undefined) input.ui.log(`Step file created: ${file.path}`);
  input.ui.log(`Workflow saved: ${join(input.cwd, ".maestrun/config.json")}`);
  if (!setup.prepareOrchestratorPlan) input.ui.log("Run maestrun plan to create the plan.");
  return setup;
}
