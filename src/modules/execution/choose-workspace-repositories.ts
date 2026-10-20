import { loadConfig, readConfigDocument, saveConfigDocument } from "../../config/index.js";
import type { CommandInput } from "../../shared/command.types.js";
import { BackError, CancelError, UserError } from "../../shared/errors.js";
import { isRecord } from "../../contracts/workflow.js";
import {
  checkWorkspaceRepositories,
  discoverWorkspaceRepositories,
} from "./workspace-repositories.js";

export async function chooseWorkspaceRepositories(input: CommandInput): Promise<void> {
  const { config } = await loadConfig(input.cwd);
  if (config?.execution?.mode !== "parallel" || config.execution.repositories) return;
  const paths = await discoverWorkspaceRepositories(input.cwd);
  if (paths[0] === ".") return;
  const { document, snapshot } = await readConfigDocument(input.cwd);
  try {
    const repositories = await chooseRepositories(input, paths);
    if (input.signal.aborted) throw new CancelError();
    await saveConfigDocument(
      input.cwd,
      {
        ...document,
        execution: { ...(isRecord(document.execution) ? document.execution : {}), repositories },
      },
      snapshot,
    );
    input.ui.log(`Workspace repositories saved: ${repositories.join(", ")}.`);
  } catch (error) {
    if (error instanceof BackError) throw new CancelError();
    throw error;
  }
}

async function chooseRepositories(
  input: CommandInput,
  paths: readonly string[],
): Promise<readonly string[]> {
  while (true) {
    const selected = await input.ui.checkbox(
      "Repositories for this workspace — select only those belonging to this project",
      paths.map((path) => ({ name: path, value: path })),
      [],
    );
    if (!selected.length) throw new CancelError();
    try {
      if (selected.some((path) => !paths.includes(path))) throw new CancelError();
      await checkWorkspaceRepositories(input.cwd, selected);
      return selected;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      input.ui.log(`${error.message} ${error.nextAction}`);
    }
  }
}
