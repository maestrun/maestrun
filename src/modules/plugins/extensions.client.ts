import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isRecord } from "../../contracts/workflow.js";
import { UserError, isCancellation } from "../../shared/errors.js";
import type { StepInput } from "../../contracts/run.js";

export type Extension = Readonly<{
  name: string;
  beforeStep?: (input: StepInput) => Promise<void> | void;
  afterStep?: (input: StepInput & { result: string }) => Promise<void> | void;
  stages?: Readonly<Record<string, (input: StepInput) => Promise<string> | string>>;
}>;

function pluginError(path: string): UserError {
  return new UserError(
    `Extension failed: ${path}.`,
    "Check the trusted extension's API version, hooks and stage handlers, or remove it from config.plugins.",
  );
}

function parseExtension(value: unknown, path: string): Extension {
  if (
    !isRecord(value) ||
    value.apiVersion !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim()
  )
    throw pluginError(path);
  for (const key of ["beforeStep", "afterStep"])
    if (value[key] !== undefined && typeof value[key] !== "function") throw pluginError(path);
  if (
    value.stages !== undefined &&
    (!isRecord(value.stages) ||
      Object.entries(value.stages).some(
        ([id, handler]) => !id.startsWith("custom:") || typeof handler !== "function",
      ))
  )
    throw pluginError(path);
  return value as Extension;
}

export async function loadExtensions(
  cwd: string,
  paths: readonly string[],
  trusted = false,
): Promise<readonly Extension[]> {
  if (paths.length && !trusted)
    throw new UserError(
      "Project extensions require explicit approval before loading.",
      "Review config.plugins and their dependencies, then run maestrun run --trust-plugins with your other run options. This grants full process permissions for this run only.",
    );
  const extensions: Extension[] = [];
  const root = await realpath(cwd);
  for (const path of paths) {
    try {
      const file = await realpath(resolve(root, path));
      const location = relative(root, file);
      if (location.startsWith("..") || isAbsolute(location)) throw pluginError(path);
      const module: unknown = await import(pathToFileURL(file).href);
      extensions.push(parseExtension(isRecord(module) ? module.default : undefined, path));
    } catch {
      throw pluginError(path);
    }
  }
  const stages = extensions.flatMap((plugin) => Object.keys(plugin.stages ?? {}));
  if (new Set(stages).size !== stages.length) throw pluginError("duplicate stage handlers");
  if (new Set(extensions.map((plugin) => plugin.name)).size !== extensions.length)
    throw pluginError("duplicate names");
  return extensions;
}

async function invoke<T>(plugin: Extension, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isCancellation(error)) throw error;
    throw pluginError(plugin.name);
  }
}

export function extensionExecutor(
  extensions: readonly Extension[],
  execute: (input: StepInput) => Promise<string>,
): (input: StepInput) => Promise<string> {
  return async (input) => {
    for (const plugin of extensions) await invoke(plugin, () => plugin.beforeStep?.(input));
    const owner = extensions.find((plugin) => plugin.stages?.[input.stage.id]);
    const handler = owner?.stages?.[input.stage.id];
    const result =
      owner && handler ? await invoke(owner, () => handler(input)) : await execute(input);
    if (typeof result !== "string" || !result.trim())
      throw pluginError(owner?.name ?? "empty step result");
    for (const plugin of extensions)
      await invoke(plugin, () => plugin.afterStep?.({ ...input, result }));
    return result;
  };
}

export function extensionProviders(
  extensions: readonly Extension[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    extensions.flatMap((plugin) => Object.keys(plugin.stages ?? {}).map((id) => [id, plugin.name])),
  );
}
