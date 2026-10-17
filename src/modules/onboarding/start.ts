import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { snapshotFile } from "../../shared/atomic.js";
import type { CommandInput } from "../../shared/command.types.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { resumableSession } from "../execution/index.js";
import { runWithRecovery } from "./run-recovery.js";
import { runWorkflow } from "../execution/index.js";
import { createPlan } from "../planning/index.js";
import { initializeProject } from "./initialize-project.js";
import { doctor } from "./doctor.js";

type StartInput = CommandInput & {
  tasksPath?: string;
  trustPlugins?: boolean;
  background?: boolean;
};
const SERVICES = {
  doctor,
  initialize: initializeProject,
  plan: createPlan,
  validate: runWorkflow,
  run: runWithRecovery,
  session: resumableSession,
};

async function timed(
  input: CommandInput,
  label: string,
  action: () => Promise<unknown>,
): Promise<void> {
  const started = Date.now();
  try {
    await action();
  } finally {
    input.ui.log(`${label}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}

export async function start(input: StartInput, services = SERVICES): Promise<void> {
  if (input.signal.aborted) throw new CancelError();
  if (await services.session(input.cwd)) {
    await services.run(input);
    return;
  }
  await timed(input, "Environment checks", () => services.doctor(input, true));
  if (!(await loadConfig(input.cwd)).config) {
    await timed(input, "Configuration", () => services.initialize({ ...input, quick: true }));
    await services.doctor(input, true);
  } else input.ui.log("Reusing saved workflow.");
  const tasksPath = input.tasksPath ?? "plan.md";
  if (!(await snapshotFile(resolve(input.cwd, tasksPath))).exists) {
    if (tasksPath !== "plan.md")
      throw new UserError(
        `Task file not found: ${tasksPath}.`,
        "Restore this file or use maestrun start with the default plan.md.",
      );
    await services.plan(input);
  } else input.ui.log(`Reusing ${tasksPath} and saved progress.`);
  if (input.signal.aborted) throw new CancelError();
  await services.validate({ ...input, tasksPath, dryRun: true });
  if (!(await input.ui.confirm("Start or resume task execution?", true))) return;
  await services.run({ ...input, tasksPath });
}
