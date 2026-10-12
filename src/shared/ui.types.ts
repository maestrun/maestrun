import type { StageId } from "../contracts/workflow.js";
import type { RunReport } from "../contracts/run.js";
export type RunView = { update: () => void; close: () => void };

export const ADD_CUSTOM_STEP = "add-custom-step";
export const CREATE_STEP_FILES = "create-step-files";
export type StageAction = typeof ADD_CUSTOM_STEP | typeof CREATE_STEP_FILES;
export type StageChoice = StageId | StageAction;

export type Choice = Readonly<{
  name: string;
  value: string;
  disabled?: string;
}>;
export type Ui = Readonly<{
  cancelPending?: () => void;
  runView?: (report: RunReport, cwd: string) => RunView | undefined;
  select: (message: string, choices: readonly Choice[], preferred?: string) => Promise<string>;
  search: (message: string, choices: readonly Choice[], preferred?: string) => Promise<string>;
  checkbox: (
    message: string,
    choices: readonly Choice[],
    selected?: readonly string[],
  ) => Promise<readonly string[]>;
  stages: (
    selected: readonly StageId[],
    order?: readonly StageId[],
  ) => Promise<readonly StageChoice[]>;
  orderStep: (ids: readonly StageId[], step: StageId) => Promise<readonly StageId[]>;
  input: (message: string, initial?: string) => Promise<string>;
  confirm: (message: string, initial?: boolean) => Promise<boolean>;
  paste: (initial?: string) => Promise<string>;
  log: (message: string) => void;
  write: (text: string) => void;
  progress: <T>(message: string, task: () => Promise<T>) => Promise<T>;
}>;
