import type { Config } from "../../contracts/workflow.js";
import type { Ui } from "../../shared/ui.types.js";
import { UserError } from "../../shared/errors.js";

export async function selectExecution(ui: Ui, config: Config): Promise<Config> {
  const mode = await ui.select(
    "Task execution",
    [
      { name: "Sequential — one task at a time", value: "sequential" },
      {
        name: "Parallel — independent Git worktrees, up to the configured limit",
        value: "parallel",
      },
    ],
    config.execution?.mode ?? "sequential",
  );
  if (mode !== "sequential" && mode !== "parallel")
    throw new UserError("Invalid execution mode.", "Choose sequential or parallel.");
  return {
    ...config,
    execution: { ...config.execution, mode, concurrency: config.execution?.concurrency ?? 2 },
  };
}
