import type { Command } from "commander";
import { interactive } from "./cli.js";
import { saveTemplate } from "./modules/workflow/index.js";
import { exportTemplate, importTemplate } from "./modules/workflow/index.js";

export function registerTemplate(program: Command): void {
  const command = program
    .command("template")
    .description("Portable workflows with step instructions and extension requirements");
  command
    .command("save <name>")
    .description("Review and save a reusable workflow and its instructions")
    .action(async (name: string) =>
      interactive("template save", (input) => saveTemplate(input, name)),
    );
  command
    .command("export <file>")
    .description("Export configuration, instructions and extension references as a JSON package")
    .action(async (file: string) =>
      interactive("template export", (input) => exportTemplate(input, file)),
    );
  command
    .command("import <file> <name>")
    .description("Import a package into the template library without executing plugins")
    .action(async (file: string, name: string) =>
      interactive("template import", (input) => importTemplate(input, file, name)),
    );
}
