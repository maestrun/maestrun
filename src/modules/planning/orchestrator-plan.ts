import { join } from "node:path";
import type { Config, Draft } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { loadTasks, lockRun } from "../execution/index.js";
import { createPlan } from "./create-plan.js";
import { loadGuidance } from "./guidance-step.js";
import { selectRequirementsPath } from "./requirements-step.js";
import { loadConfig } from "../../config/index.js";
import { reviewTaskPlan } from "./task-plan-review.js";

async function promptDraft(input: CommandInput & { config: Config }): Promise<Draft> {
  input.ui.log("Choose a prompt file to generate plan.md with the selected planning model.");
  const requirements = await selectRequirementsPath(input, "prompt.md");
  return {
    config: input.config,
    requirements,
    planMode: "simple",
    guidance: await loadGuidance(input),
  };
}

export async function prepareOrchestratorPlan(input: CommandInput): Promise<void> {
  try {
    if (input.signal.aborted) throw new CancelError();
    const plan = await snapshotFile(join(input.cwd, "plan.md"));
    if (plan.exists && (await input.ui.confirm("Use the existing plan.md?", true))) {
      await reusePlan(input);
    } else {
      await createPlan(input, { wizard: promptDraft });
    }
  } catch (error) {
    if (error instanceof BackError) throw new CancelError();
    throw error;
  }
}

async function reusePlan(input: CommandInput): Promise<void> {
  const release = await lockRun(input.cwd);
  try {
    if (input.signal.aborted) throw new CancelError();
    const tasks = await loadTasks(input.cwd, "plan.md");
    const { config } = await loadConfig(input.cwd);
    input.ui.log("Reusing plan.md.");
    if (config) await reviewTaskPlan(input, config, tasks);
  } finally {
    await release();
  }
}
