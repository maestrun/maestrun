import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../../config/index.js";
import {
  bundleTemplate,
  parseTemplate,
  templateNotices,
  templateStepFiles,
} from "./template-bundle.js";
import type { TemplateBundle } from "./template-bundle.js";
import { saveStepFiles } from "./step-files.js";
import type { CommandInput } from "../../shared/command.types.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { ensureHomeDirectory } from "../../shared/home.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { configTable } from "./config-table.js";

const TEMPLATE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u;

export async function templatePath(name: string): Promise<string> {
  if (!TEMPLATE_NAME.test(name))
    throw new UserError(
      "Invalid template name.",
      "Use 1–64 letters, digits, hyphens or underscores, starting with a letter or digit.",
    );
  return join(await ensureHomeDirectory("templates"), `${name}.json`);
}

async function listTemplates(): Promise<string[]> {
  const directory = await ensureHomeDirectory("templates");
  return (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        TEMPLATE_NAME.test(entry.name.slice(0, -5)),
    )
    .map((entry) => entry.name.slice(0, -5))
    .sort((a, b) => a.localeCompare(b));
}

async function readTemplate(name: string): Promise<TemplateBundle> {
  const snapshot = await snapshotFile(await templatePath(name));
  if (!snapshot.exists)
    throw new UserError(
      `Template ${name} was not found.`,
      "Run maestrun template save <name> in a configured project.",
    );
  try {
    return parseTemplate(snapshot.content);
  } catch {
    throw new UserError(
      `Template ${name} is invalid.`,
      "Save it again from a project with a valid configuration.",
    );
  }
}

async function confirmSettings(
  input: CommandInput,
  bundle: TemplateBundle,
  message: string,
): Promise<void> {
  input.ui.log(configTable(bundle.config));
  for (const notice of templateNotices(bundle)) input.ui.log(notice);
  if (input.signal.aborted || !(await input.ui.confirm(message, false)) || input.signal.aborted)
    throw new CancelError();
}

export async function saveTemplate(input: CommandInput, name: string): Promise<void> {
  const path = await templatePath(name);
  const { config } = await loadConfig(input.cwd);
  if (!config)
    throw new UserError(
      "No workflow configuration found.",
      "Run maestrun init before saving a template.",
    );
  const bundle = await bundleTemplate(input.cwd, config);
  const expected = await snapshotFile(path);
  await confirmSettings(input, bundle, `${expected.exists ? "Replace" : "Save"} template ${name}?`);
  await atomicWrite(path, `${JSON.stringify(bundle, null, 2)}\n`, expected);
  input.ui.log(`Template saved: ${path}`);
}

export async function initializeFromTemplate(input: CommandInput): Promise<void> {
  const names = await listTemplates();
  if (!names.length)
    throw new UserError(
      "No saved templates found.",
      "Run maestrun template save <name> in a configured project first.",
    );
  const saved = await loadConfig(input.cwd);
  const name = await input.ui.select(
    "Choose a workflow template",
    names.map((name) => ({ name, value: name })),
  );
  const bundle = await readTemplate(name);
  const files = await templateStepFiles(input.cwd, bundle);
  await confirmSettings(
    input,
    bundle,
    `${saved.snapshot.exists ? "Replace the project workflow" : "Initialize this project"} with template ${name}?`,
  );
  await saveStepFiles(input.cwd, files, input.signal);
  await saveConfig(input.cwd, bundle.config, saved.snapshot);
  input.ui.log(`Workflow saved: ${join(input.cwd, ".maestrun/config.json")}`);
  input.ui.log("Run maestrun plan to create the plan.");
}
