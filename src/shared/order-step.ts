import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useKeypress,
  useState,
} from "@inquirer/core";
import chalk from "chalk";
import { stageLabel } from "../contracts/workflow.js";
import type { StageId } from "../contracts/workflow.js";

type OrderInput = Readonly<{ ids: readonly StageId[]; step: StageId }>;

function placedSteps(config: OrderInput, position: number): readonly StageId[] {
  const others = config.ids.filter((id) => id !== config.step);
  return [...others.slice(0, position), config.step, ...others.slice(position)];
}

function orderList(ids: readonly StageId[], step: StageId): string {
  return ids
    .map((id, index) => {
      const label = `${index + 1}. ${stageLabel(id)}${id === "planning" ? " (always first)" : ""}`;
      return id === step ? chalk.cyan(`❯ ${label} (new)`) : `  ${label}`;
    })
    .join("\n");
}

export const orderStepPrompt = createPrompt<readonly StageId[], OrderInput>((config, done) => {
  const [position, setPosition] = useState(config.ids.indexOf(config.step));
  const [complete, setComplete] = useState(false);
  const ids = placedSteps(config, position);
  useKeypress((key, readline) => {
    readline.clearLine(0);
    if (isEnterKey(key)) {
      setComplete(true);
      done(ids);
    } else if (isUpKey(key)) {
      setPosition(Math.max(1, position - 1));
    } else if (isDownKey(key)) {
      setPosition(Math.min(config.ids.length - 1, position + 1));
    }
  });
  const heading = `${complete ? "✔" : "?"} Order ${stageLabel(config.step)}`;
  const help = complete ? "" : "\n↑/↓ move step · Enter continue · Esc back · Ctrl+C cancel";
  return `${chalk.bold(heading)}\n${orderList(ids, config.step)}${help}`;
});
