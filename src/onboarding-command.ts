import type { Command } from "commander";
import { interactive } from "./cli.js";
import { doctor } from "./modules/onboarding/index.js";
import { start } from "./modules/onboarding/index.js";

export function registerOnboarding(program: Command): void {
  program
    .command("doctor")
    .description(
      "Check environment, authentication, configuration, files and locks without model generation",
    )
    .action(async () =>
      interactive(
        "doctor",
        async (input) => {
          if (!(await doctor(input))) process.exitCode = 1;
        },
        false,
      ),
    );
}

export function registerStart(program: Command): void {
  program
    .command("start")
    .description("Configure, plan, validate and run; reuse existing workflow and progress")
    .option("--tasks <file>", "Reuse a task document", "plan.md")
    .option("--trust-plugins", "Authorize reviewed plugins for this run only")
    .option("--background", "Start execution in the background")
    .option("--no-background", "Watch execution in the foreground")
    .action(async (options: { tasks: string; trustPlugins?: boolean; background?: boolean }) =>
      interactive("start", (input) =>
        start({
          ...input,
          tasksPath: options.tasks,
          trustPlugins: options.trustPlugins ?? false,
          ...(options.background !== undefined ? { background: options.background } : {}),
        }),
      ),
    );
}
