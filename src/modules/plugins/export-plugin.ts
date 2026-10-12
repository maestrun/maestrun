import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UserError } from "../../shared/errors.js";

export async function exportPlugin(directory: string): Promise<string> {
  const destination = resolve(directory);
  try {
    await mkdir(destination);
  } catch {
    throw new UserError(
      "Could not create plugin directory.",
      "Choose a new directory in a writable parent; existing directories are preserved.",
    );
  }
  try {
    await copyBundle(destination);
  } catch {
    await rm(destination, { recursive: true, force: true });
    throw new UserError(
      "Could not export the plugin bundle.",
      "Reinstall Maestrun with its plugins directory and retry.",
    );
  }
  return `Plugin bundle exported: ${destination}\nClaude: claude --plugin-dir ${shellArgument(resolve(destination, "maestrun"))}\nCodex: codex plugin marketplace add ${shellArgument(destination)}\nThen install maestrun from the maestrun-local marketplace.`;
}

async function copyBundle(destination: string): Promise<void> {
  const source = fileURLToPath(new URL("../../../plugins", import.meta.url));
  for (const name of await readdir(source))
    await cp(resolve(source, name), resolve(destination, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
}

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
