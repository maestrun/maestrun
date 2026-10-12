import os from "node:os";
import { join } from "node:path";
import { ensureStateDirectory, validateStateDirectory } from "../shared/project-state.js";
import { atomicWrite, snapshotFile } from "../shared/atomic.js";
import type { FileSnapshot } from "../shared/atomic.js";
import { isRecord } from "../contracts/workflow.js";
import type { Config } from "../contracts/workflow.js";
import { UserError } from "../shared/errors.js";
import { parseConfig } from "./config.js";
import { configOptions } from "./config-options.js";
import { parseStepPresets } from "./step-presets.js";

export type SavedConfig = Readonly<{ config: Config | undefined; snapshot: FileSnapshot }>;
export type ConfigDocument = Record<string, unknown>;

export function mergeConfig(global: ConfigDocument, project: ConfigDocument): ConfigDocument {
  const execution = {
    ...(isRecord(global.execution) ? global.execution : {}),
    ...(isRecord(project.execution) ? project.execution : {}),
  };
  return { ...global, ...project, ...(Object.keys(execution).length ? { execution } : {}) };
}

export function validateConfigDocument(value: ConfigDocument, global = false): void {
  if (value.stepPresets !== undefined && !global)
    throw new UserError(
      "stepPresets is a global setting.",
      "Use maestrun config global stepPresets.",
    );
  parseStepPresets(value.stepPresets);
  if (!global || value.stages !== undefined) {
    parseConfig(value);
    return;
  }
  if (value.version !== undefined && value.version !== 1)
    throw new UserError("This configuration version is unsupported.", "Use version 1.");
  configOptions(value);
  if (value.targets !== undefined)
    parseConfig({
      ...value,
      version: 1,
      stages: [{ id: "planning", executor: "codex", model: "validation" }],
    });
}

export async function readConfigDocument(
  cwd: string,
  global = false,
): Promise<{
  document: ConfigDocument;
  snapshot: FileSnapshot;
}> {
  await validateStateDirectory(cwd);
  const snapshot = await snapshotFile(join(cwd, ".maestrun", "config.json"));
  if (!snapshot.exists) return { document: {}, snapshot };
  try {
    const document: unknown = JSON.parse(snapshot.content);
    if (!isRecord(document)) throw new Error("Expected an object");
    validateConfigDocument(document, global);
    return { document, snapshot };
  } catch (error) {
    throw new UserError(
      `The saved Maestrun configuration is invalid: ${join(cwd, ".maestrun/config.json")}.`,
      error instanceof UserError ? error.message : "Restore a valid JSON configuration.",
    );
  }
}

export async function loadGlobalConfig(): Promise<ConfigDocument> {
  return (await readConfigDocument(os.homedir(), true)).document;
}

export async function loadConfig(cwd: string): Promise<SavedConfig> {
  const { document, snapshot } = await readConfigDocument(cwd);
  const merged = mergeConfig(await loadGlobalConfig(), document);
  if (merged.stages === undefined) return { config: undefined, snapshot };
  return { config: parseConfig(merged), snapshot };
}

export async function saveConfig(
  cwd: string,
  config: Config,
  expected: FileSnapshot,
): Promise<void> {
  await saveConfigDocument(cwd, config, expected);
}

export async function saveConfigDocument(
  cwd: string,
  document: ConfigDocument,
  expected: FileSnapshot,
): Promise<void> {
  await ensureStateDirectory(cwd);
  await atomicWrite(
    join(cwd, ".maestrun", "config.json"),
    `${JSON.stringify(document, null, 2)}\n`,
    expected,
  );
}
