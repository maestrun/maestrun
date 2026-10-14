import { join } from "node:path";
import { snapshotFile } from "../../shared/atomic.js";
import type { Draft, Requirements } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError } from "../../shared/errors.js";
import { discoverPlanningFiles } from "./planning-files.js";
import { selectRequirements } from "./requirements-step.js";
import { selectPlanFolder } from "./advanced-plan.js";

export type PlanRequirements = Pick<Draft, "requirements" | "planMode" | "planFolder">;

async function selectStyle(
  context: CommandInput,
  previous?: PlanRequirements,
): Promise<Omit<PlanRequirements, "requirements">> {
  const selected = await context.ui.select(
    "Plan style",
    [
      { name: "Simple — an implementation plan", value: "simple" },
      { name: "Advanced — PRD, technical specification, and tasks", value: "advanced" },
    ],
    previous?.planMode === "advanced" ? "advanced" : "simple",
  );
  return selected === "advanced"
    ? { planMode: "advanced", planFolder: await selectPlanFolder(context, previous?.planFolder) }
    : { planMode: "simple" };
}

export async function selectPlanRequirements(
  context: CommandInput,
  previous?: PlanRequirements,
): Promise<PlanRequirements> {
  const files = await discoverPlanningFiles(context.cwd);
  context.ui.log(
    files.length ? `Found planning files: ${files.join(", ")}` : "No related planning files found.",
  );
  let requirements: Requirements | undefined = previous?.requirements;
  while (true) {
    requirements = await selectRequirements(context, requirements, files);
    if (requirements.source !== "Pasted text") return { requirements, planMode: "existing" };
    const hasProgress = (await snapshotFile(join(context.cwd, ".maestrun/run.json"))).exists;
    if (files.length && !hasProgress) return { requirements, planMode: "simple" };
    try {
      return { requirements, ...(await selectStyle(context, previous)) };
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}
