import { checkbox, confirm, editor, input, search, select } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { answer, navigation, withBack } from "./navigation.js";
import { orderStepPrompt } from "./order-step.js";
import { stagesPrompt } from "./stages-prompt.js";
import type { Choice, Ui } from "./ui.types.js";

async function choose(
  message: string,
  choices: readonly Choice[],
  options: { preferred?: string; signal: AbortSignal },
): Promise<string> {
  return answer(
    await select<string | symbol>(
      {
        message,
        loop: false,
        choices: navigation(choices),
        ...(options.preferred ? { default: options.preferred } : {}),
      },
      { signal: options.signal },
    ),
  );
}

async function searchModels(
  message: string,
  choices: readonly Choice[],
  options: { preferred?: string; signal: AbortSignal },
): Promise<string> {
  const sorted = [...choices].sort(
    (a, b) => Number(b.value === options.preferred) - Number(a.value === options.preferred),
  );
  return answer(
    await search<string | symbol>(
      {
        message,
        source: (term) =>
          navigation(
            sorted.filter(
              (choice) =>
                choice.value === "" ||
                choice.name.toLowerCase().includes((term ?? "").toLowerCase()),
            ),
          ),
      },
      { signal: options.signal },
    ),
  );
}

async function progress<T>(message: string, task: () => Promise<T>): Promise<T> {
  const spinner = ora({
    text: message,
    isEnabled: Boolean(process.stdout.isTTY),
  }).start();
  try {
    return await task();
  } finally {
    spinner.stop();
  }
}

function chooseFiles(signal: AbortSignal): Pick<Ui, "checkbox"> {
  return {
    checkbox: (message, choices, selected = []) =>
      withBack(
        (abort) =>
          checkbox(
            {
              message,
              choices: choices.map((choice) => ({
                ...choice,
                checked: selected.includes(choice.value),
              })),
              required: false,
              loop: false,
            },
            { signal: abort },
          ),
        signal,
      ),
  };
}

function menus(signal: AbortSignal): Pick<Ui, "select" | "search" | "stages"> {
  return {
    select: (message, choices, preferred) =>
      withBack(
        (abort) =>
          choose(message, choices, {
            ...(preferred !== undefined ? { preferred } : {}),
            signal: abort,
          }),
        signal,
      ),
    search: (message, choices, preferred) =>
      withBack(
        (abort) =>
          searchModels(message, choices, {
            ...(preferred !== undefined ? { preferred } : {}),
            signal: abort,
          }),
        signal,
      ),
    stages: (selected, order) =>
      withBack(
        (abort) => stagesPrompt({ selected, ...(order ? { order } : {}) }, { signal: abort }),
        signal,
      ),
  };
}

function createTerminalUi(signal: AbortSignal): Ui {
  return {
    ...menus(signal),
    ...chooseFiles(signal),
    orderStep: (ids, step) =>
      withBack((abort) => orderStepPrompt({ ids, step }, { signal: abort }), signal),
    input: (message, initial) =>
      withBack(
        (abort) => input({ message, default: initial, prefill: "editable" }, { signal: abort }),
        signal,
      ),
    confirm: (message, initial = false) =>
      withBack((abort) => confirm({ message, default: initial }, { signal: abort }), signal),
    paste: (initial = "") =>
      editor(
        {
          message: "Paste requirements into your editor, then save and close it",
          default: initial,
          postfix: ".md",
        },
        { signal },
      ),
    log: (message) => console.log(chalk.cyan(message)),
    write: (text) => void process.stdout.write(text),
    progress,
  };
}

export function terminalUi(signal: AbortSignal): Ui {
  const controller = new AbortController();
  return {
    ...createTerminalUi(AbortSignal.any([signal, controller.signal])),
    cancelPending: () => controller.abort(),
  };
}
