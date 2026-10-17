import type { CommandInput } from "../../shared/command.types.js";
import { initialize } from "../workflow/index.js";
import { prepareOrchestratorPlan } from "../planning/index.js";

export async function initializeProject(input: CommandInput & { quick?: boolean }): Promise<void> {
  const setup = await initialize(input);
  if (setup.prepareOrchestratorPlan) await prepareOrchestratorPlan(input);
}
