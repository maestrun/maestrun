import { join } from "node:path";
import { saveConfig } from "../../config/index.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { checkProjectFile } from "../../shared/project-file.js";
import { validateStepDirectory } from "../workflow/index.js";
import type { RunContext } from "./execution.types.js";
import { resolvedOrchestration } from "./orchestration-config.js";

export async function copyWorktreeSettings(context: RunContext, path: string): Promise<void> {
  await validateStepDirectory(path);
  const orchestration = context.report.orchestration
    ? resolvedOrchestration(context.config, context.report.orchestration.tasks)
    : undefined;
  await saveConfig(
    path,
    { ...context.config, ...(orchestration ? { orchestration } : {}) },
    await snapshotFile(join(path, ".maestrun/config.json")),
  );
  for (const file of new Set(
    context.config.stages.flatMap((stage) => (stage.file ? [stage.file] : [])),
  )) {
    await checkProjectFile(context.cwd, file);
    const source = await snapshotFile(join(context.cwd, file));
    const destination = join(path, file);
    await atomicWrite(destination, source.content, await snapshotFile(destination));
  }
}
