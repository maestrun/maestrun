import { selectAssignment } from "./assignments.js";
import type { Assignment, Config, Targets } from "../../contracts/workflow.js";
import { BackError } from "../../shared/errors.js";
import type { WizardContext } from "./wizard.types.js";

async function assignTargets(context: WizardContext, config: Config): Promise<Targets> {
  const fallback = config.stages.find((stage) => stage.id === "implementation") ?? config.stages[0];
  if (!fallback) throw new Error("Missing stage assignments");
  const assignments: Assignment[] = [];
  const targets = ["frontend", "backend"] as const;
  let index = 0;
  while (index < targets.length) {
    const target = targets[index];
    if (!target) break;
    context.ui.log(`${target} executor, model and effort`);
    try {
      assignments[index] = await selectAssignment(
        context,
        assignments[index] ?? config.targets?.[target] ?? fallback,
      );
      index += 1;
    } catch (error) {
      if (!(error instanceof BackError) || index === 0) throw error;
      index -= 1;
    }
  }
  const [frontend, backend] = assignments;
  if (!frontend || !backend) throw new Error("Missing target assignments");
  return { frontend, backend };
}

export async function selectTargets(context: WizardContext, config: Config): Promise<Config> {
  while (true) {
    const advanced = await context.ui.confirm(
      "Advanced mode: select frontend and backend executors, models and effort separately?",
      config.targets !== undefined,
    );
    if (!advanced) {
      const basic = { ...config };
      delete basic.targets;
      return basic;
    }
    try {
      return { ...config, targets: await assignTargets(context, config) };
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}
