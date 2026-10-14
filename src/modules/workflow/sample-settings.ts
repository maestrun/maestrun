import { loadConfig } from "../../config/index.js";
import type { Assignment } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { detectExecutors, discoverModels } from "../executors/index.js";
import { selectAssignment } from "./assignments.js";
import type { WizardServices } from "./wizard.types.js";

export async function selectSampleAssignment(
  input: CommandInput,
  services: WizardServices = { detect: detectExecutors, models: discoverModels },
): Promise<Assignment> {
  const { config } = await loadConfig(input.cwd);
  const initial =
    config?.stages.find((stage) => stage.id === "implementation") ?? config?.stages[0];
  input.ui.log(
    "Choose executor, model and effort for all sample stages. Low effort is suggested when supported; project settings stay unchanged.",
  );
  try {
    return await selectAssignment(
      {
        ...input,
        services,
        catalog: (executor) => services.models(executor, input.cwd, input.signal),
      },
      { ...(initial ?? { executor: "codex", model: "" }), effort: "low" },
    );
  } catch (error) {
    if (error instanceof BackError) throw new CancelError();
    throw error;
  }
}
