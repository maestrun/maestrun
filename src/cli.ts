import chalk from "chalk";
import { isCancellation, UserError } from "./shared/errors.js";
import type { CommandInput } from "./shared/command.types.js";
import { terminalUi } from "./shared/terminal.js";
import { createRunView } from "./modules/execution/index.js";

export function reportError(error: unknown): void {
  if (isCancellation(error)) {
    console.log("Cancelled.");
    process.exitCode = 130;
    return;
  }
  if (error instanceof UserError) {
    console.error(chalk.red(`Error: ${error.message}`));
    console.error(`Next: ${error.nextAction}`);
  } else {
    console.error("Error: Maestrun could not finish the command.");
    console.error(
      "Next: Check file permissions and executor installation, then retry the command.",
    );
  }
  process.exitCode = 1;
}

function requireTerminal(command: string): void {
  if (process.platform === "win32")
    throw new UserError(
      "Native Windows terminals are not supported in V1.",
      "Run maestrun init inside WSL.",
    );
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new UserError(
      `${command} requires an interactive terminal.`,
      `Run maestrun ${command} directly in a terminal inside your project.`,
    );
}

export async function interactive(
  command: string,
  action: (input: CommandInput) => Promise<void>,
  needsTerminal = true,
): Promise<void> {
  if (needsTerminal) requireTerminal(command);
  const controller = new AbortController();
  const interrupt = (): void => {
    controller.abort();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    await action({
      cwd: process.cwd(),
      ui: { ...terminalUi(controller.signal), runView: createRunView },
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
