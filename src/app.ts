import { Command } from "commander";
import { VERSION } from "./shared/version.js";
import { createPlan } from "./modules/planning/index.js";
import { initializeFromTemplate } from "./modules/workflow/index.js";
import { runSession } from "./modules/execution/index.js";
import { registerRun } from "./run-command.js";
import { exportPlugin } from "./modules/plugins/index.js";
import { registerSample } from "./sample-command.js";
import { registerTemplate } from "./template-command.js";
import { registerOnboarding, registerStart } from "./onboarding-command.js";
import { doctor, initializeProject } from "./modules/onboarding/index.js";
import { interactive } from "./cli.js";
import { configure, CONFIG_HELP } from "./config/index.js";

async function initCommand(options: { template?: boolean; advanced?: boolean }): Promise<void> {
  await interactive(
    "init",
    options.template
      ? initializeFromTemplate
      : (input) => initializeProject({ ...input, quick: !options.advanced }),
  );
}

async function planCommand(options: { interactive?: boolean }): Promise<void> {
  await interactive("plan", async (input) => {
    await doctor(input, true);
    await createPlan({ ...input, ...options });
  });
}

function registerSetup(program: Command): void {
  program
    .command("init")
    .description("Quick setup: executor, model and standard, orchestrator or customized workflow")
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
    .version(VERSION)
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
