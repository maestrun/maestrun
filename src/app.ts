import { Command } from "commander";
import { createPlan } from "./modules/planning/index.js";
import { initialize, initializeFromTemplate } from "./modules/workflow/index.js";
import { runWorkflow, runSession, showRun } from "./modules/execution/index.js";
import { exportPlugin } from "./modules/plugins/index.js";
import { registerSample } from "./sample-command.js";
import { registerTemplate } from "./template-command.js";
import { registerOnboarding, registerStart } from "./onboarding-command.js";
import { doctor } from "./modules/onboarding/index.js";
import { runWithRecovery } from "./modules/onboarding/index.js";
import { interactive } from "./cli.js";
import { configure, CONFIG_HELP } from "./config/index.js";

type RunOptions = {
  tasks: string;
  dryRun?: boolean;
  status?: boolean;
  background?: boolean;
  trustPlugins?: boolean;
};

async function initCommand(options: { template?: boolean; advanced?: boolean }): Promise<void> {
  await interactive(
    "init",
    options.template
      ? initializeFromTemplate
      : (input) => initialize({ ...input, quick: !options.advanced }),
  );
}

async function planCommand(options: { interactive?: boolean }): Promise<void> {
  await interactive("plan", async (input) => {
    await doctor(input, true);
    await createPlan({ ...input, ...options });
  });
}

async function runCommand(options: RunOptions): Promise<void> {
  if (options.status) return showRun(process.cwd());
  if (!options.dryRun) {
    await interactive(
      "run",
      (input) =>
        runWithRecovery({
          ...input,
          tasksPath: options.tasks,
          trustPlugins: options.trustPlugins ?? false,
          ...(options.background !== undefined ? { background: options.background } : {}),
        }),
      false,
    );
    return;
  }
  await interactive(
    "run",
    (input) =>
      runWorkflow({
        ...input,
        tasksPath: options.tasks,
        ...(options.dryRun ? { dryRun: true } : {}),
      }),
    false,
  );
}

function registerRun(program: Command): void {
  program
    .command("run")
    .description("Execute planned tasks and report stage, model, progress and errors")
    .option("--tasks <file>", "Markdown tasks or plan (legacy JSON supported)", "plan.md")
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

function registerSetup(program: Command): void {
  program
    .command("init")
    .description("Quick setup: executor, model and standard or customized workflow")
    .option("--advanced", "Open all workflow settings directly")
    .option("--template", "Choose a saved template and review its settings before initializing")
    .action(initCommand);
  program
    .command("plan")
    .description("Create a plan with the saved workflow and all project skills and rules")
    .option("--interactive", "Plan with clarification questions using the selected model")
    .action(planCommand);
}

function registerConfig(program: Command): void {
  program
    .command("config [settings...]")
    .description(
      "Show or edit project configuration; prefix with global to edit ~/.maestrun/config.json",
    )
    .addHelpText("after", CONFIG_HELP)
    .action(async (settings: string[]) => configure(process.cwd(), settings));
}

export function createApp(): Command {
  const program = new Command();
  program
    .name("maestrun")
    .description(
      "Guided workflows, planning and task execution with Codex, Claude Code, GitHub Copilot CLI, and Grok Build",
    )
    .version("0.1.1-beta.0")
    .showHelpAfterError();
  program.action(async () => {
    if (!(await runSession({ cwd: process.cwd(), resumeOnly: true }))) program.outputHelp();
  });
  registerSetup(program);
  registerRun(program);
  registerSample(program);
  registerTemplate(program);
  registerConfig(program);
  registerOnboarding(program);
  registerStart(program);
  program
    .command("plugin")
    .description("Export the local Codex and Claude plugin bundle into a new directory")
    .argument("<directory>")
    .action(async (directory: string) => console.log(await exportPlugin(directory)));
  return program;
}
