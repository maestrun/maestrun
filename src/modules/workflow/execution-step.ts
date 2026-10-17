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
      { name: "Orchestrator — manage a predefined task plan", value: "plan" },
      { name: "Orchestrator agent — create and coordinate tasks", value: "agent" },
    ],
    config.execution?.orchestrator ?? config.execution?.mode ?? "sequential",
  );
  if (mode === "plan" || mode === "agent") return orchestratedExecution(ui, config, mode);
  if (mode !== "sequential" && mode !== "parallel")
    throw new UserError("Invalid execution mode.", "Choose sequential or parallel.");
  const execution = {
    ...config.execution,
    mode: mode as "sequential" | "parallel",
    concurrency: config.execution?.concurrency ?? 2,
  };
  delete execution.orchestrator;
  return {
    ...config,
    execution,
  };
}

export async function orchestratedExecution(
  ui: Ui,
  config: Config,
  orchestrator: "plan" | "agent",
): Promise<Config> {
  const mode = await ui.select(
    "Managed task execution",
    [
      { name: "Sequential — one task at a time", value: "sequential" },
      { name: "Parallel — isolated Git worktrees", value: "parallel" },
    ],
    config.execution?.mode ?? "sequential",
  );
  if (mode !== "sequential" && mode !== "parallel")
    throw new UserError("Invalid execution mode.", "Choose sequential or parallel.");
  return {
    ...config,
    execution: {
      ...config.execution,
      mode,
      orchestrator,
      concurrency: config.execution?.concurrency ?? 2,
    },
  };
}
