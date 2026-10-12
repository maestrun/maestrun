import { isRecord } from "../contracts/workflow.js";
import { UserError } from "../shared/errors.js";
import type { ConfigDocument } from "./config-storage.js";

const FIELDS: Readonly<Record<string, readonly string[]>> = {
  root: ["stages", "targets", "execution", "timeoutMs", "plugins", "stepPresets"],
  preset: ["name", "executor", "model", "effort"],
  execution: ["mode", "concurrency", "background", "maxRepairs"],
  assignment: ["executor", "model", "effort"],
  stage: ["id", "executor", "model", "effort", "file"],
  targets: ["frontend", "backend"],
};

function invalid(message: string): never {
  throw new UserError(message, "Run maestrun config --help for supported paths and examples.");
}

function checkFields(value: unknown, group: string): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value))
    if (!FIELDS[group]?.includes(key)) invalid(`Unknown configuration field: ${key}.`);
}

function checkValue(field: string, value: unknown): void {
  if (field === "execution") checkFields(value, "execution");
  if (field === "stages" && Array.isArray(value))
    for (const stage of value) checkFields(stage, "stage");
  if (field === "targets" && isRecord(value)) {
    checkFields(value, "targets");
    for (const target of Object.values(value)) checkFields(target, "assignment");
  }
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function configPath(args: readonly string[]): string[] {
  const path = args.length === 2 ? (args[0] ?? "").split(".") : args.slice(0, -1);
  if (path[0] === "stage") path[0] = "stages";
  if (["background", "concurrency"].includes(path[0] ?? "")) path.unshift("execution");
  if (
    path.length === 1 &&
    path[0] === "execution" &&
    ["parallel", "sequential"].includes(args.at(-1) ?? "")
  )
    path.push("mode");
  return path;
}

function stageObject(document: ConfigDocument, selector: string): ConfigDocument {
  const stages = Array.isArray(document.stages) ? document.stages : [];
  const stage: unknown = /^\d+$/u.test(selector)
    ? stages[Number(selector)]
    : stages.find((entry: unknown) => isRecord(entry) && entry.id === selector);
  if (!isRecord(stage)) return invalid(`Stage not found: ${selector}.`);
  return stage;
}

function presetObject(document: ConfigDocument, selector: string): ConfigDocument {
  const presets = Array.isArray(document.stepPresets) ? document.stepPresets : [];
  const index = /^\d+$/u.test(selector)
    ? Number(selector)
    : presets.findIndex((entry: unknown) =>
        typeof entry === "string" ? entry === selector : isRecord(entry) && entry.name === selector,
      );
  if (typeof presets[index] === "string") presets[index] = { name: presets[index] };
  const preset: unknown = presets[index];
  if (!isRecord(preset)) return invalid(`Step preset not found: ${selector}.`);
  return preset;
}

function editTarget(document: ConfigDocument, path: readonly string[]): ConfigDocument {
  const [root, selector, field] = path;
  if (path.length === 1 && FIELDS.root?.includes(root ?? "")) return document;
  if (root === "execution" && path.length === 2 && FIELDS.execution?.includes(selector ?? "")) {
    if (!isRecord(document.execution)) document.execution = {};
    return document.execution as ConfigDocument;
  }
  if (root === "stages" && selector && path.length === 3 && FIELDS.stage?.includes(field ?? ""))
    return stageObject(document, selector);
  if (
    root === "stepPresets" &&
    selector &&
    path.length === 3 &&
    FIELDS.preset?.includes(field ?? "")
  )
    return presetObject(document, selector);
  if (
    root === "targets" &&
    FIELDS.targets?.includes(selector ?? "") &&
    (path.length === 2 || (path.length === 3 && FIELDS.assignment?.includes(field ?? "")))
  ) {
    if (!isRecord(document.targets)) document.targets = {};
    const targets = document.targets as ConfigDocument;
    if (path.length === 2) return targets;
    if (!isRecord(targets[selector ?? ""])) targets[selector ?? ""] = {};
    return targets[selector ?? ""] as ConfigDocument;
  }
  return invalid(`Unknown configuration path: ${path.join(".")}.`);
}

export function editConfig(document: ConfigDocument, args: readonly string[]): ConfigDocument {
  if (args.length < 2) return invalid("Specify a configuration path and value.");
  const path = configPath(args);
  const field = path.at(-1) ?? "";
  const updated = structuredClone(document);
  const target = editTarget(updated, path);
  const value = parseValue(args.at(-1) ?? "");
  checkValue(field, value);
  if (path[0] === "targets" && path.length === 2) checkFields(value, "assignment");
  if (value === null) delete target[field];
  else target[field] = value;
  return updated;
}
