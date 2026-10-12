import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
} from "@inquirer/core";
import type { KeypressEvent } from "@inquirer/core";
import chalk from "chalk";
import { isBuiltinStage, isStage, stageLabel, workflowOrder } from "../contracts/workflow.js";
import type { StageId } from "../contracts/workflow.js";
import { ADD_CUSTOM_STEP, CREATE_STEP_FILES } from "./ui.types.js";
import type { StageAction, StageChoice } from "./ui.types.js";

type StageOption = StageChoice | "continue";
type StageState = Readonly<{
  active: number;
  selected: readonly StageId[];
  complete: boolean;
  action?: StageAction;
}>;

const ACTION_NAMES: Readonly<Record<StageAction | "continue", string>> = {
  [ADD_CUSTOM_STEP]: "+ Add a custom step (Enter)",
  [CREATE_STEP_FILES]: "Create Markdown files for custom steps (Enter)",
  continue: "Continue",
};

function stageOptions(ids: readonly StageId[]): readonly StageOption[] {
  const actions: readonly StageAction[] = ids.some((id) => !isBuiltinStage(id))
    ? [ADD_CUSTOM_STEP, CREATE_STEP_FILES]
    : [ADD_CUSTOM_STEP];
  return [...ids, ...actions, "continue"];
}

function selectedAfterKey(
  key: KeypressEvent,
  state: StageState,
  ids: readonly StageId[],
): readonly StageId[] {
  if (key.name === "a") return ids.every((id) => state.selected.includes(id)) ? ["planning"] : ids;
  if (key.name === "i")
    return ids.filter((id) => id === "planning" || !state.selected.includes(id));
  const id = ids[state.active];
  if (!isSpaceKey(key) || !id || id === "planning") return state.selected;
  return state.selected.includes(id)
    ? state.selected.filter((selected) => selected !== id)
    : ids.filter((selected) => selected === id || state.selected.includes(selected));
}

function stageKey(key: KeypressEvent, state: StageState, ids: readonly StageId[]): StageState {
  const choices = stageOptions(ids);
  if (isUpKey(key) || isDownKey(key)) {
    const size = choices.length;
    const offset = isUpKey(key) ? -1 : 1;
    return { ...state, active: Math.max(0, Math.min(size - 1, state.active + offset)) };
  }
  const choice = choices[state.active];
  const action = choice === ADD_CUSTOM_STEP || choice === CREATE_STEP_FILES ? choice : undefined;
  if (isEnterKey(key) || (action && isSpaceKey(key)))
    return { ...state, complete: true, ...(action ? { action } : {}) };
  return { ...state, selected: selectedAfterKey(key, state, ids) };
}

function stageRow(option: StageOption, state: StageState, index: number): string {
  const cursor = index === state.active ? "❯" : " ";
  if (!isStage(option)) return `${cursor} ${ACTION_NAMES[option]}`;
  const checked = state.selected.includes(option);
  const row = `${cursor}${checked ? "◉" : "◯"} ${stageLabel(option)}`;
  if (option === "planning") return chalk.dim(`${row} (always included)`);
  return index === state.active ? chalk.cyan(row) : row;
}

export const stagesPrompt = createPrompt<
  readonly StageChoice[],
  { selected: readonly StageId[]; order?: readonly StageId[] }
>((config, done) => {
  const ids = config.order ?? workflowOrder(config.selected);
  const [state, setState] = useState<StageState>({
    active: 0,
    complete: false,
    selected: ids.filter((id) => id === "planning" || config.selected.includes(id)),
  });
  const prefix = usePrefix({ status: state.complete ? "done" : "idle" });
  useKeypress((key, readline) => {
    readline.clearLine(0);
    const next = stageKey(key, state, ids);
    setState(next);
    if (next.complete) done(next.action ? [...next.selected, next.action] : next.selected);
  });
  const choices = stageOptions(ids);
  const page = usePagination({
    items: choices,
    active: state.active,
    pageSize: 7,
    loop: false,
    renderItem: ({ item, index }) => stageRow(item, state, index),
  });
  const heading = `${prefix} Workflow stages (planning is required)`;
  if (state.complete) return `${heading} ${state.selected.map(stageLabel).join(", ")}`;
  return `${heading}\n${page}\n\n↑↓ navigate · Space toggle · Enter choose/continue · a all · i invert · Esc back`;
});
