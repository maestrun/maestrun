import { input } from "@inquirer/prompts";
import { expect } from "vitest";
import { orderStepPrompt } from "../../src/shared/order-step.js";
import { stagesPrompt } from "../../src/shared/stages-prompt.js";
import type { Ui } from "../../src/shared/ui.types.js";
import { runWizard, selectWorkflow } from "../../src/modules/workflow/index.js";
import { wizardContext } from "../helpers/context.js";
import { promptHarness } from "../helpers/prompts.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const EXPECTED = ["planning", "custom:Security audit", "custom:Release notes"];
const SETTINGS = [
  false,
  "codex",
  "codex-test",
  "high",
  "claude",
  "claude-test-model",
  "max",
  "codex",
  "codex-test",
  "low",
  "codex",
  "codex-test",
  "medium",
  false,
  "sequential",
] as const;
const EXPECTED_STAGES = [
  { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
  { id: "custom:Security audit", executor: "claude", model: "claude-test-model", effort: "max" },
  { id: "custom:Release notes", executor: "codex", model: "codex-test", effort: "low" },
  { id: "implementation", executor: "codex", model: "codex-test", effort: "medium" },
];

function workflowUi(
  terminal: ReturnType<typeof promptHarness>,
  script: ReturnType<typeof scriptedUi>,
): Ui {
  return {
    ...script.ui,
    stages: (selected, order) =>
      stagesPrompt({ selected, ...(order ? { order } : {}) }, terminal.context),
    input: (message, initial) =>
      message === "Custom step name"
        ? input({ message, default: initial, prefill: "editable" }, terminal.context)
        : script.ui.input(message, initial),
    orderStep: (ids, step) => orderStepPrompt({ ids, step }, terminal.context),
  };
}

async function addSteps(terminal: ReturnType<typeof promptHarness>): Promise<void> {
  await terminal.send([DOWN, DOWN, DOWN, "\r"]);
  expect(terminal.screen()).toContain("Custom step name");
  await terminal.send(["Security audit\r"]);
  expect(terminal.screen()).toContain("Order Security audit");
  await terminal.send([UP, UP, "\r"]);
  await terminal.send([DOWN, DOWN, DOWN, DOWN, "\r"]);
  await terminal.send(["Release notes\r"]);
  expect(terminal.screen()).toContain("Order Release notes");
  await terminal.send([UP, UP, "\r"]);
}

test("Enter creates and orders multiple steps before any model selection", async ({ project }) => {
  const terminal = promptHarness();
  const script = scriptedUi([]);
  const ui = workflowUi(terminal, script);
  const result = selectWorkflow(wizardContext(project.cwd, ui), ["planning"]);
  await addSteps(terminal);
  expect(script.calls).toHaveLength(0);
  await terminal.send([UP, "\r"]);
  expect((await result).selected).toEqual(EXPECTED);
  expect(script.remaining()).toBe(0);
});

test("Continue assigns each step's model and effort in the final workflow order", async ({
  project,
}) => {
  const terminal = promptHarness();
  const script = scriptedUi(SETTINGS);
  const context = wizardContext(project.cwd, workflowUi(terminal, script));
  const result = runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  await expect.poll(() => terminal.screen()).toContain("Workflow stages");
  await addSteps(terminal);
  expect(script.calls).toHaveLength(0);
  await terminal.send([DOWN, DOWN, DOWN, DOWN, " ", UP, UP, UP, UP]);
  await terminal.send([UP, "\r"]);
  expect((await result).config.stages).toEqual(EXPECTED_STAGES);
  expect(script.remaining()).toBe(0);
});
