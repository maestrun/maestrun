import { join } from "node:path";
import { validateStepDirectory } from "./step-files.js";
import { parseConfig } from "../../config/index.js";
import { isRecord, validStepFile } from "../../contracts/workflow.js";
import type { Config, StepFile } from "../../contracts/workflow.js";
import { snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { checkProjectFile } from "../../shared/project-file.js";

export type TemplateBundle = {
  kind: "maestrun-template";
  version: 1;
  config: Config;
  files: Record<string, string>;
  extensions: { path: string; status: "external" | "missing"; requirements: string[] }[];
  missing: string[];
};

const REQUIREMENTS = [
  "Maestrun extension API version 1",
  "Copy the extension and install its documented dependencies in the destination project",
  "Review code and dependencies; --trust-plugins is required separately for each run",
];

export async function bundleTemplate(cwd: string, config: Config): Promise<TemplateBundle> {
  const bundle: TemplateBundle = {
    kind: "maestrun-template",
    version: 1,
    config,
    files: {},
    extensions: [],
    missing: [],
  };
  for (const path of new Set(config.stages.flatMap((stage) => (stage.file ? [stage.file] : [])))) {
    try {
      await checkProjectFile(cwd, path);
      bundle.files[path] = (await snapshotFile(join(cwd, path))).content;
    } catch {
      bundle.missing.push(path);
    }
  }
  for (const path of config.plugins ?? []) {
    let status: "external" | "missing" = "external";
    try {
      await checkProjectFile(cwd, path);
    } catch {
      status = "missing";
      bundle.missing.push(path);
    }
    bundle.extensions.push({ path, status, requirements: [...REQUIREMENTS] });
  }
  return bundle;
}

function invalidBundle(): never {
  throw new UserError(
    "Invalid template package.",
    "Export a new package with maestrun template export. Only referenced .maestrun/steps/*.md files may be included.",
  );
}

export function parseTemplate(content: string): TemplateBundle {
  if (Buffer.byteLength(content) > 2 * 1024 * 1024) invalidBundle();
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return invalidBundle();
  }
  if (!isRecord(value)) invalidBundle();
  if (value.kind === undefined) return legacyTemplate(parseConfig(value));
  if (value.kind !== "maestrun-template" || value.version !== 1 || !isRecord(value.files))
    invalidBundle();
  const config = parseConfig(value.config);
  const paths = new Set(config.stages.flatMap((stage) => (stage.file ? [stage.file] : [])));
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(value.files)) {
    if (!validStepFile(path) || !paths.has(path) || typeof text !== "string") invalidBundle();
    files[path] = text;
  }
  // Recompute metadata: importing a package never grants trust or assumes plugins are present.
  const bundle = legacyTemplate(config);
  bundle.files = files;
  bundle.missing = [...paths].filter((path) => files[path] === undefined);
  for (const extension of bundle.extensions) {
    if (!Array.isArray(value.missing) || !value.missing.includes(extension.path)) continue;
    extension.status = "missing";
    bundle.missing.push(extension.path);
  }
  return bundle;
}

function legacyTemplate(config: Config): TemplateBundle {
  return {
    kind: "maestrun-template",
    version: 1,
    config,
    files: {},
    extensions: (config.plugins ?? []).map((path) => ({
      path,
      status: "external",
      requirements: [...REQUIREMENTS],
    })),
    missing: config.stages.flatMap((stage) => (stage.file ? [stage.file] : [])),
  };
}

export function templateNotices(bundle: TemplateBundle): string[] {
  return [
    ...bundle.missing.map(
      (path) =>
        `Missing: ${path}. Copy it into the destination project or remove its stage/plugin reference.`,
    ),
    ...bundle.extensions.flatMap((extension) => [
      `External plugin: ${extension.path}`,
      ...extension.requirements,
    ]),
  ];
}

export async function templateStepFiles(cwd: string, bundle: TemplateBundle): Promise<StepFile[]> {
  await validateStepDirectory(cwd);
  const files: StepFile[] = [];
  for (const stage of bundle.config.stages) {
    if (!stage.file || bundle.files[stage.file] === undefined) continue;
    const saved = await snapshotFile(join(cwd, stage.file));
    const content = bundle.files[stage.file];
    if (content === undefined) continue;
    if (saved.exists && saved.content !== content)
      throw new UserError(
        `Instruction file already exists: ${stage.file}.`,
        "Compare it with the template and move it aside only if you want to replace it, then retry.",
      );
    if (!saved.exists && !files.some((file) => file.path === stage.file))
      files.push({ id: stage.id, path: stage.file, content });
  }
  return files;
}
