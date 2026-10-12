import type { Config, Draft, Guidance } from "../../contracts/workflow.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { loadGuidance } from "./guidance-step.js";
import { confirmPlan } from "./preview.js";
import { selectPlanRequirements } from "./plan-style.js";
import type { PlanRequirements } from "./plan-style.js";
import type { CommandInput } from "../../shared/command.types.js";

type Input = CommandInput & Readonly<{ config: Config; planExists: boolean }>;
type State = {
  step: number;
  requirements: PlanRequirements | undefined;
  guidance: Guidance | undefined;
};

async function advance(input: Input, state: State): Promise<Draft | undefined> {
  if (state.step === 0) {
    input.ui.log("Step 1/2 — Requirements");
    state.requirements = await selectPlanRequirements(input, state.requirements);
    state.guidance = await loadGuidance(input);
  }
  if (state.step === 1) {
    if (!state.requirements || !state.guidance) throw new Error("Plan settings are incomplete");
    return confirmPlan(
      input,
      { config: input.config, ...state.requirements, guidance: state.guidance },
      input.planExists,
    );
  }
  state.step += 1;
  return undefined;
}

export async function runPlanWizard(input: Input): Promise<Draft> {
  const state: State = { step: 0, requirements: undefined, guidance: undefined };
  while (true) {
    try {
      const draft = await advance(input, state);
      if (draft) return draft;
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
      if (state.step === 0) throw new CancelError();
      state.step -= 1;
    }
  }
}
