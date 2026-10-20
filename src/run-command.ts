import type { CommandInput } from "./shared/command.types.js";
import type { Command } from "commander";
import {
  runWorkflow,
  showRun,
  chooseRunTasks,
  chooseWorkspaceRepositories,
  resumableSession,
} from "./modules/execution/index.js";
import type { TaskSelection } from "./modules/execution/index.js";
import { runWithRecovery } from "./modules/onboarding/index.js";
import { interactive } from "./cli.js";

type RunOptions = {
  tasks: string;
  only?: string;
  skip?: string;
  dryRun?: boolean;
  status?: boolean;
  background?: boolean;
  trustPlugins?: boolean;
};

async function runCommand(options: RunOptions): Promise<void> {
  if (options.status) return showRun(process.cwd());
  if (!options.dryRun) return executeSelected(options);
  await interactive(
    "run",
    (input) =>
      runWorkflow({ ...input, tasksPath: options.tasks, dryRun: true, ...selection(options) }),
    false,
  );
}

function selection(options: RunOptions): TaskSelection {
  return {
    ...(options.only !== undefined ? { only: options.only.split(",") } : {}),
    ...(options.skip !== undefined ? { skip: options.skip.split(",") } : {}),
  };
}

async function executeSelected(options: RunOptions): Promise<void> {
  await interactive(
    "run",
    async (input) => {
      const only = await interactiveSelection(input, options);
      await runWithRecovery({
        ...input,
        tasksPath: options.tasks,
        ...(only ? { only } : {}),
        ...(options.skip !== undefined ? { skip: options.skip.split(",") } : {}),
        trustPlugins: options.trustPlugins ?? false,
        ...(options.background !== undefined ? { background: options.background } : {}),
      });
    },
    false,
  );
}

async function interactiveSelection(
  input: CommandInput,
  options: RunOptions,
): Promise<readonly string[] | undefined> {
  if (process.stdin.isTTY && process.stdout.isTTY && !(await resumableSession(input.cwd))) {
    await chooseWorkspaceRepositories(input);
    if (options.only === undefined && options.skip === undefined)
      return chooseRunTasks({ ...input, tasksPath: options.tasks });
  }
  return options.only?.split(",");
}

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Execute planned tasks and report stage, model, progress and errors")
    .option("--tasks <file>", "Markdown tasks or plan (legacy JSON supported)", "plan.md")
    .option("--only <ids>", "Run only these comma-separated task IDs for this invocation")
    .option("--skip <ids>", "Leave these comma-separated task IDs for a later run")
    .option("--dry-run", "Validate and preview tasks without executing or loading plugins")
    .option(
      "--trust-plugins",
      "Allow configured plugins and their dependencies full process access for this run",
    )
    .option("--status", "Print the last persisted run report as JSON")
    .option("--background", "Start or leave task execution in the background")
    .option("--no-background", "Watch execution, overriding the saved background preference")
    .action(runCommand);
}
