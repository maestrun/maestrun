import { join } from "node:path";
import { executorLabel, stageLabel } from "../../contracts/workflow.js";
import type { Draft } from "../../contracts/workflow.js";
import { CancelError } from "../../shared/errors.js";
import type { CommandInput } from "../../shared/command.types.js";

function reviewDraft(context: CommandInput, draft: Draft): void {
  context.ui.log(`Plan style: ${draft.planMode ?? "simple"}`);
  if (draft.planMode === "advanced")
    context.ui.log(`Documents: ${draft.planFolder ?? "tasks"}/{prd,techspec,tasks}.md`);
  for (const stage of draft.config.stages)
    context.ui.log(
      `${stageLabel(stage.id)}: ${executorLabel(stage.executor)} / ${stage.model} / effort: ${stage.effort ?? "default"}${stage.file ? ` / instructions: ${stage.file}` : ""}`,
    );
  if (draft.config.targets)
    for (const target of ["frontend", "backend"] as const) {
      const assignment = draft.config.targets[target];
      context.ui.log(
        `${target} implementation: ${executorLabel(assignment.executor)} / ${assignment.model} / effort: ${assignment.effort ?? "default"}`,
      );
    }
  context.ui.log(
    `Requirements: ${draft.requirements.source} (${Buffer.byteLength(draft.requirements.text)} bytes)`,
  );
  context.ui.log(`Output: ${join(context.cwd, "plan.md")}`);
  for (const kind of ["skills", "rules"] as const)
    context.ui.log(
      `${kind}: ${draft.guidance?.[kind].map((file) => file.path).join(", ") || "none found"}`,
    );
}

export async function confirmPlan(
  context: CommandInput,
  draft: Draft,
  planExists: boolean,
): Promise<Draft> {
  context.ui.log("Step 2/2 — Review and generate");
  reviewDraft(context, draft);
  context.ui.log(
    "Only planning will run. Generating a plan invokes the selected executor and may consume your available usage.",
  );
  if (
    !(await context.ui.confirm(
      "Generate the plan with the saved workflow and project guidance?",
      false,
    ))
  )
    throw new CancelError();
  if (
    planExists &&
    !(await context.ui.confirm(
      "Replace the existing root-level plan.md after successful generation?",
      false,
    ))
  )
    throw new CancelError();
  return draft;
}
