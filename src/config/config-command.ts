import os from "node:os";
import { join } from "node:path";
import { UserError } from "../shared/errors.js";
import { configPath, editConfig } from "./config-edit.js";
import {
  loadGlobalConfig,
  mergeConfig,
  readConfigDocument,
  saveConfigDocument,
  validateConfigDocument,
} from "./config-storage.js";
import type { ConfigDocument } from "./config-storage.js";

async function editBase(
  scope: { cwd: string; global: boolean },
  document: ConfigDocument,
  args: readonly string[],
): Promise<ConfigDocument> {
  const { cwd, global } = scope;
  const root = configPath(args)[0];
  const base = { version: 1, ...document };
  if (root !== "stages" && root !== "targets") return base;
  if (document[root] !== undefined || configPath(args).length === 1) return base;
  const fallback = global ? (await readConfigDocument(cwd)).document : await loadGlobalConfig();
  return { ...base, ...(fallback[root] === undefined ? {} : { [root]: fallback[root] }) };
}

export async function configure(cwd: string, arguments_: readonly string[]): Promise<void> {
  const global = arguments_[0] === "global";
  const args = global ? arguments_.slice(1) : arguments_;
  const directory = global ? os.homedir() : cwd;
  const { document, snapshot } = await readConfigDocument(directory, global);
  if (!args.length) {
    console.log(
      JSON.stringify(global ? document : mergeConfig(await loadGlobalConfig(), document), null, 2),
    );
    return;
  }
  let updated = editConfig(await editBase({ cwd, global }, document, args), args);
  if (!global && updated.stages === undefined) {
    const defaults = await loadGlobalConfig();
    if (defaults.stages === undefined)
      throw new UserError(
        "No workflow configuration found.",
        "Run maestrun init first, or set stages with a JSON array.",
      );
    updated = { ...updated, stages: defaults.stages };
  }
  validateConfigDocument(updated, global);
  await saveConfigDocument(directory, updated, snapshot);
  console.log(`Configuration saved: ${join(directory, ".maestrun/config.json")}`);
}

export const CONFIG_HELP = `
Examples:
  maestrun config background true
  maestrun config execution parallel
  maestrun config execution.concurrency 4
  maestrun config execution.maxRepairs 5
  maestrun config stages planning model your-model-id
  maestrun config stages planning executor claude
  maestrun config stages planning effort high
  maestrun config targets frontend model your-model-id
  maestrun config timeoutMs 600000
  maestrun config plugins '["./plugin.mjs"]'
  maestrun config global background true
  maestrun config global stepPresets '["QA", {"name":"Security audit","executor":"codex","effort":"high"}]'
  maestrun config global stepPresets 'Security audit' model your-model-id

Paths accept spaces or dots. Stages accept an ID or zero-based index.
Global stepPresets accept a name or zero-based index.
Use JSON for objects/arrays and null to remove a field. Project settings override
global defaults. Use config or config global without values to view settings.`;
