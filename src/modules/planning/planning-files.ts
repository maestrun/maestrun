import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileFailure } from "../../shared/errors.js";

const SKIPPED = new Set(["node_modules", "dist", "build", "coverage", "vendor", "target"]);
const PLANNING_NAME =
  /(?:^|[-_. ])(?:prds?|tech[-_ ]?specs?|technical[-_ ]?specifications?|specs?|specifications?|requirements?|plans?|planning|tasks?|designs?|briefs?|proposals?|features?|scope|roadmap|prompt)(?:$|[-_. ])/iu;

async function scan(cwd: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => {
    throw fileFailure(`Could not check ${relative(cwd, directory) || "."} for planning files.`);
  });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await scan(cwd, path)));
    if (entry.isFile() && /\.(md|markdown|txt|rst|adoc)$/iu.test(entry.name)) {
      const local = relative(cwd, path);
      if (local.split(/[\\/]/u).some((part) => PLANNING_NAME.test(part))) paths.push(local);
    }
  }
  return paths;
}

export async function discoverPlanningFiles(cwd: string): Promise<readonly string[]> {
  // ponytail: filename/directory hints cover conventional docs; the file picker handles custom names.
  return (await scan(cwd, cwd)).sort((a, b) => a.localeCompare(b));
}
