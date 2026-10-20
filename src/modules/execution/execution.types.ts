import type { Config } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import type { StepInput, TaskState, RunReport } from "../../contracts/run.js";

export type RunContext = CommandInput &
  Readonly<{
    config: Config;
    tasksPath?: string;
    selectedTaskIds?: readonly string[];
    projectCwd?: string;
    repositoryPaths?: readonly string[];
    report: RunReport;
    providers?: Readonly<Record<string, string>>;
    execute: (input: StepInput) => Promise<string>;
    update: (state: TaskState) => Promise<void>;
  }>;

import type { RunView, Ui } from "../../shared/ui.types.js";
import type { ViewState } from "./run-view-state.js";
import type { RunSession } from "./run-session.repository.js";

export type SessionView = {
  cwd: string;
  ui: Ui;
  session: RunSession;
  report?: RunReport;
  view?: RunView;
  detached: boolean;
  closed: boolean;
  choosing?: Promise<void>;
  prompt?: AbortController;
  error?: unknown;
  lines: Map<string, string>;
  notice?: string;
  selection?: ViewState;
};
