import { join } from "node:path";
import { isRecord } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import type { CommandInput } from "../../shared/command.types.js";
import { CancelError, isCancellation, UserError } from "../../shared/errors.js";
import { cleanText } from "../../shared/terminal-text.js";
import { initialize } from "../workflow/index.js";
import type { TaskSelection } from "../execution/index.js";
import { runSession } from "../execution/index.js";
import { runWorkflow } from "../execution/index.js";

type RunInput = CommandInput &
  TaskSelection & { tasksPath?: string; background?: boolean; trustPlugins?: boolean };
const SERVICES = { run: runSession, configure: initialize, validate: runWorkflow };

async function evidence(input: CommandInput): Promise<void> {
  const saved = await snapshotFile(join(input.cwd, ".maestrun/run.json"));
  if (saved.exists) {
    const report: unknown = JSON.parse(saved.content);
    if (isRecord(report) && Array.isArray(report.tasks))
      input.ui.log(saved.content.split("\n").map(cleanText).join("\n"));
  } else input.ui.log("No task report yet. Inspect .maestrun/run.log for worker diagnostics.");
}

async function recoveryAction(input: RunInput, services: typeof SERVICES): Promise<boolean> {
  while (true) {
    const action = await input.ui.select(
      "Recovery",
      [
        { name: "View evidence — saved task and step results", value: "evidence" },
        { name: "Adjust configuration", value: "configure" },
        { name: "Resume — preserve completed tasks and steps", value: "resume" },
        { name: "Exit and keep progress", value: "exit" },
      ],
      "evidence",
    );
    if (action === "exit") return false;
    if (action === "evidence") await evidence(input);
    if (action === "configure") await services.configure(input);
    if (action === "resume") {
      await services.validate({ ...input, dryRun: true });
      return true;
    }
  }
}

export async function runWithRecovery(
  input: RunInput,
  services = SERVICES,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
): Promise<void> {
  while (true) {
    if (input.signal.aborted) throw new CancelError();
    try {
      await services.run(input);
      return;
    } catch (error) {
      if (isCancellation(error) || !terminal || !(error instanceof UserError)) throw error;
      input.ui.log(`Failed: ${cleanText(error.message)}\nNext: ${cleanText(error.nextAction)}`);
      if (!(await recoveryAction(input, services))) throw error;
    }
  }
}
