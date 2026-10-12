import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, hasCode } from "../../shared/atomic.js";
import { isBuiltinStage, stageLabel, validStepFile } from "../../contracts/workflow.js";
import type { StageId, StepFile } from "../../contracts/workflow.js";
import { ensureStateDirectory } from "../../shared/project-state.js";
import { CancelError, UserError, fileFailure } from "../../shared/errors.js";
import type { WizardContext } from "./wizard.types.js";

const MAX_FILE_STEM_LENGTH = 50;
type FileSettings = Readonly<{ order: readonly StageId[]; files?: readonly StepFile[] }>;

function template(id: StageId): string {
  return [
    `# ${stageLabel(id)}`,
    "",
    "## Purpose",
    "Describe what this step should achieve.",
    "",
    "## Instructions",
    "- Add the actions this step should perform.",
    "",
    "## Expected output",
    "Describe the files or results this step should produce.",
    "",
    "## Verification",
    "Describe how to check that the step is complete.",
    "",
  ].join("\n");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw fileFailure("Could not check the custom step file path.");
  }
}

export async function validateStepDirectory(cwd: string): Promise<void> {
  for (const directory of [join(cwd, ".maestrun"), join(cwd, ".maestrun", "steps")]) {
    try {
      if (!(await lstat(directory)).isDirectory())
        throw new UserError(
          "The step file directory must not be a file or symlink.",
          "Use a regular .maestrun/steps directory.",
        );
    } catch (error) {
      if (hasCode(error, "ENOENT")) continue;
      if (error instanceof UserError) throw error;
      throw fileFailure("Could not access the custom step file directory.");
    }
  }
}

function fileStem(id: StageId): string {
  const name = stageLabel(id).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const slug = name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "");
  return Array.from(slug).slice(0, MAX_FILE_STEM_LENGTH).join("").replace(/-+$/u, "") || "step";
}

async function availablePath(
  context: WizardContext,
  id: StageId,
  files: readonly StepFile[],
): Promise<string> {
  const stem = fileStem(id);
  let index = 1;
  while (true) {
    const path = `.maestrun/steps/${stem}${index === 1 ? "" : `-${index}`}.md`;
    if (!files.some((file) => file.path === path) && !(await fileExists(join(context.cwd, path))))
      return path;
    index += 1;
  }
}

export async function prepareStepFiles(
  context: WizardContext,
  settings: FileSettings,
): Promise<readonly StepFile[]> {
  await validateStepDirectory(context.cwd);
  let files = [...(settings.files ?? [])];
  for (const id of settings.order.filter((id) => !isBuiltinStage(id))) {
    const existing = files.find((file) => file.id === id);
    if (existing?.content !== undefined) continue;
    if (existing && (await fileExists(join(context.cwd, existing.path)))) continue;
    const path = existing?.path ?? (await availablePath(context, id, files));
    files = [...files.filter((file) => file.id !== id), { id, path, content: template(id) }];
    context.ui.log(`Step file prepared: ${path} (created when the workflow is saved)`);
  }
  return files;
}

export async function saveStepFiles(
  cwd: string,
  files: readonly StepFile[],
  signal: AbortSignal,
): Promise<void> {
  const pending = files.filter((file) => file.content !== undefined);
  if (!pending.length) return;
  await validateStepDirectory(cwd);
  for (const file of pending) {
    if (signal.aborted) throw new CancelError();
    if (!validStepFile(file.path) || isBuiltinStage(file.id))
      throw new UserError(
        "The custom step file path is invalid.",
        "Create step files inside .maestrun/steps.",
      );
    await ensureStateDirectory(cwd);
    if (file.content !== undefined)
      await atomicWrite(join(cwd, file.path), file.content, { exists: false, content: "" });
  }
}
