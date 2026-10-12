import { select } from "@inquirer/prompts";
import { closeSessionView, openSessionView } from "./run-session-view.js";
import type { SessionView } from "./execution.types.js";
import { saveSessionFile } from "./run-session.repository.js";
import { isCancellation, UserError } from "../../shared/errors.js";
import { loadConfig, saveConfig } from "../../config/index.js";

export async function detachSession(state: SessionView): Promise<void> {
  await saveSessionFile(state.cwd, "background", state.session.id);
  state.detached = true;
  closeSessionView(state);
  state.ui.log(
    "Tasks are running in the background. Run maestrun in this project to return to the execution view.",
  );
}

export function sessionInterrupts(state: SessionView): () => void {
  const cancel = (): void => {
    state.prompt?.abort();
    if (state.session.status !== "running") state.closed = true;
    void saveSessionFile(state.cwd, "cancel", state.session.id).catch((error: unknown) => {
      state.error = error;
    });
  };
  const interrupt = (): void => {
    if (state.choosing) return;
    if (state.session.status !== "running") {
      state.closed = true;
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      cancel();
      return;
    }
    showChoice(state);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", cancel);
  return () => {
    state.prompt?.abort();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", cancel);
  };
}

async function choose(state: SessionView): Promise<void> {
  state.prompt = new AbortController();
  const action = await select(
    {
      message: "What should happen to the running tasks?",
      choices: [
        { name: "Run in background", value: "background" },
        { name: "Cancel execution", value: "cancel" },
        { name: "Always run in background for this project", value: "always-background" },
      ],
    },
    { signal: state.prompt.signal },
  );
  if (action === "always-background") await rememberBackground(state);
  if (action === "background" || action === "always-background") await detachSession(state);
  else await saveSessionFile(state.cwd, "cancel", state.session.id);
}

async function rememberBackground(state: SessionView): Promise<void> {
  const { config, snapshot } = await loadConfig(state.cwd);
  if (!config) throw new UserError("No saved workflow was found.", "Run maestrun init first.");
  await saveConfig(
    state.cwd,
    {
      ...config,
      execution: { mode: "sequential", concurrency: 2, ...config.execution, background: true },
    },
    snapshot,
  );
  state.ui.log(
    "New runs will start in the background. Use maestrun run --no-background to watch a new run, or set execution.background to false in .maestrun/config.json to reset the default.",
  );
}

function showChoice(state: SessionView): void {
  closeSessionView(state);
  state.choosing = choose(state)
    .catch((error: unknown) => {
      if (!isCancellation(error)) state.error = error;
    })
    .finally(() => {
      delete state.choosing;
      delete state.prompt;
      openSessionView(state);
    });
}
