import { readConfigDocument, saveConfigDocument } from "../../config/index.js";
import type { Task } from "../../contracts/tasks.js";
import type { Config, Effort, Stage } from "../../contracts/workflow.js";
import { taskDefinition } from "./task-agents.js";
import { taskStages } from "./tasks.js";

type ResolvedOrchestration = Readonly<{
  strategy: "plan" | "agent";
  tasks: readonly (Task & {
    stages: readonly (Omit<Stage, "effort"> & { effort: Effort | null })[];
  })[];
}>;

export function resolvedOrchestration(
  config: Config,
  tasks: readonly Task[],
): ResolvedOrchestration | undefined {
  const strategy = config.execution?.orchestrator;
  if (!strategy) return undefined;
  return {
    strategy,
    tasks: tasks.map((task) => ({
      ...taskDefinition(task),
      stages: taskStages(config, task).map((stage) => ({ ...stage, effort: stage.effort ?? null })),
    })),
  };
}

export async function saveOrchestrationConfig(
  cwd: string,
  config: Config,
  tasks: readonly Task[],
): Promise<void> {
  const orchestration = resolvedOrchestration(config, tasks);
  if (!orchestration) return;
  const { document, snapshot } = await readConfigDocument(cwd);
  if (JSON.stringify(document.orchestration) === JSON.stringify(orchestration)) return;
  await saveConfigDocument(
    cwd,
    { ...(!snapshot.exists ? config : {}), ...document, orchestration },
    snapshot,
  );
}
