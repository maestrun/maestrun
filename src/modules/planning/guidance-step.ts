import type { Guidance, GuidanceFile } from "../../contracts/workflow.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { discoverGuidance } from "./guidance-catalog.js";
import { readRequirements } from "../../shared/requirements.js";
import type { CommandInput } from "../../shared/command.types.js";

async function readFiles(
  context: CommandInput,
  paths: readonly string[],
): Promise<readonly GuidanceFile[]> {
  const files: GuidanceFile[] = [];
  let bytes = 0;
  for (const path of new Set(paths)) {
    if (context.signal.aborted) throw new CancelError();
    const file = await readRequirements(context.cwd, path);
    bytes += Buffer.byteLength(file.text);
    if (bytes > 1024 * 1024)
      throw new UserError(
        "Project guidance exceeds 1 MiB.",
        "Reduce the size of the project guidance files and retry.",
      );
    files.push({ path, content: file.text });
  }
  return files;
}

export async function loadGuidance(context: CommandInput): Promise<Guidance> {
  if (context.signal.aborted) throw new CancelError();
  const catalog = await discoverGuidance(context.cwd);
  const [skills, rules] = await Promise.all([
    readFiles(context, catalog.skills),
    readFiles(context, catalog.rules),
  ]);
  context.ui.log(`Loaded ${skills.length} project skills and ${rules.length} project rules.`);
  return { skills, rules };
}
