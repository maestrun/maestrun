import { resolve } from "node:path";
import { loadConfig } from "../../config/index.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import type { CommandInput } from "../../shared/command.types.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { configTable } from "./config-table.js";
import { bundleTemplate, parseTemplate, templateNotices } from "./template-bundle.js";
import type { TemplateBundle } from "./template-bundle.js";
import { templatePath } from "./templates.js";

async function writePackage(
  input: CommandInput,
  bundle: TemplateBundle,
  path: string,
): Promise<void> {
  const expected = await snapshotFile(path);
  input.ui.log(configTable(bundle.config));
  for (const notice of templateNotices(bundle)) input.ui.log(notice);
  if (
    input.signal.aborted ||
    !(await input.ui.confirm(
      `${expected.exists ? "Replace" : "Save"} template package ${path}?`,
      false,
    )) ||
    input.signal.aborted
  )
    throw new CancelError();
  await atomicWrite(path, `${JSON.stringify(bundle, null, 2)}\n`, expected);
  input.ui.log(`Template package saved: ${path}`);
}

export async function exportTemplate(input: CommandInput, file: string): Promise<void> {
  const { config } = await loadConfig(input.cwd);
  if (!config) throw new UserError("No workflow configuration found.", "Run maestrun init first.");
  const bundle = await bundleTemplate(input.cwd, config);
  await writePackage(input, bundle, resolve(input.cwd, file));
}

export async function importTemplate(
  input: CommandInput,
  file: string,
  name: string,
): Promise<void> {
  const source = await snapshotFile(resolve(input.cwd, file));
  if (!source.exists)
    throw new UserError("Template package not found.", "Check the import file path.");
  const bundle = parseTemplate(source.content);
  await writePackage(input, bundle, await templatePath(name));
  input.ui.log(
    "Run maestrun init --template in the destination project. Import does not authorize plugin execution.",
  );
}
