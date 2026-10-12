import { dirname } from "node:path";
import type { Requirements } from "../../contracts/workflow.js";
import { BackError, UserError } from "../../shared/errors.js";
import {
  listDirectory,
  readRequirements,
  validateRequirements,
} from "../../shared/requirements.js";
import type { FileEntry } from "../../shared/requirements.js";
import type { CommandInput } from "../../shared/command.types.js";

async function filePicker(context: CommandInput): Promise<Requirements> {
  let directory = context.cwd;
  while (true) {
    let listed = false;
    try {
      const entries = await listDirectory(directory);
      listed = true;
      const selected = await chooseFile(context, directory, entries);
      if (
        selected === dirname(directory) ||
        entries.some((entry) => entry.path === selected && entry.directory)
      ) {
        directory = selected;
        continue;
      }
      return await readRequirements(context.cwd, selected);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      context.ui.log(`${error.message} ${error.nextAction}`);
      directory = recoverDirectory(directory, listed, error);
    }
  }
}

async function chooseFile(
  context: CommandInput,
  directory: string,
  entries: readonly FileEntry[],
): Promise<string> {
  const choices = entries.map((entry) => ({
    name: `${entry.directory ? "▸ " : ""}${entry.name}`,
    value: entry.path,
  }));
  return context.ui.select(
    `Select requirements file: ${directory}`,
    [{ name: "▸ .. (parent directory)", value: dirname(directory) }, ...choices],
    entries.find((entry) => entry.name === "requirements.md")?.path,
  );
}

function recoverDirectory(directory: string, listed: boolean, error: UserError): string {
  if (listed) return directory;
  const parent = dirname(directory);
  if (parent === directory) throw error;
  return parent;
}

async function filePath(context: CommandInput, initial?: string): Promise<Requirements> {
  let path = initial ?? "";
  while (true) {
    path = (
      await context.ui.input("Requirements file path (absolute or relative to the project)", path)
    ).trim();
    try {
      return await readRequirements(context.cwd, path);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      context.ui.log(`${error.message} ${error.nextAction}`);
    }
  }
}

async function pastedText(context: CommandInput, initial?: string): Promise<Requirements> {
  let text = initial ?? "";
  while (true) {
    text = await context.ui.paste(text);
    try {
      return { text: validateRequirements(text), source: "Pasted text" };
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      context.ui.log(`${error.message} ${error.nextAction}`);
    }
  }
}

function selectMethod(context: CommandInput, discovered: readonly string[]): Promise<string> {
  return context.ui.select(
    "Describe the work",
    [
      ...discovered.map((path) => ({ name: `Use existing file: ${path}`, value: path })),
      { name: "Select a requirements file", value: "file" },
      { name: "Enter a requirements file path", value: "path" },
      { name: "Paste requirements in an editor", value: "paste" },
    ],
    discovered[0] ?? "file",
  );
}

export async function selectRequirements(
  context: CommandInput,
  existing?: Requirements,
  discovered: readonly string[] = [],
): Promise<Requirements> {
  while (true) {
    const method = await selectMethod(context, discovered);
    try {
      if (discovered.includes(method)) return await readRequirements(context.cwd, method);
      if (method === "file") return await filePicker(context);
      if (method === "path")
        return await filePath(
          context,
          existing?.source === "Pasted text" ? undefined : existing?.source,
        );
      return await pastedText(
        context,
        existing?.source === "Pasted text" ? existing.text : undefined,
      );
    } catch (error) {
      if (error instanceof UserError) {
        context.ui.log(`${error.message} ${error.nextAction}`);
        continue;
      }
      if (!(error instanceof BackError)) throw error;
    }
  }
}
