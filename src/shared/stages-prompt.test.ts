import { expect, test } from "vitest";
import { stagesPrompt } from "./stages-prompt.js";
import { ADD_CUSTOM_STEP, CREATE_STEP_FILES } from "./ui.types.js";
import { promptHarness } from "../../tests/helpers/prompts.js";

const UP = "\u001b[A";
const DOWN = "\u001b[B";

test("default choices exclude QA and Review and planning cannot be unchecked", async () => {
  const terminal = promptHarness();
  const selected = ["planning", "implementation", "testing"] as const;
  const result = stagesPrompt({ selected }, terminal.context);
  await terminal.send([" ", "\r"]);
  expect(await result).toEqual(selected);
  expect(terminal.screen()).toContain("Planning (always included)");
  expect(terminal.screen()).not.toContain("QA");
  expect(terminal.screen()).not.toContain("Review");
});

test("Enter on Add opens creation without checking an extra box", async () => {
  const terminal = promptHarness();
  const result = stagesPrompt({ selected: ["planning", "implementation"] }, terminal.context);
  await terminal.send([DOWN, DOWN, DOWN, "\r"]);
  expect(await result).toEqual(["planning", "implementation", ADD_CUSTOM_STEP]);
  expect(terminal.screen()).toContain("+ Add a custom step (Enter)");
});

test("Space on Add also opens creation directly", async () => {
  const terminal = promptHarness();
  const result = stagesPrompt({ selected: ["planning"] }, terminal.context);
  await terminal.send([DOWN, DOWN, DOWN, " "]);
  expect(await result).toEqual(["planning", ADD_CUSTOM_STEP]);
});

test("Space toggles stages and Enter preserves their workflow order", async () => {
  const terminal = promptHarness();
  const result = stagesPrompt({ selected: ["planning"] }, terminal.context);
  await terminal.send([DOWN, " ", DOWN, " ", UP, " ", "\r"]);
  expect(await result).toEqual(["planning", "testing"]);
});

test.for([
  { keys: [" ", "\r"], expected: ["planning"] },
  { keys: [UP, "\r"], expected: ["planning"] },
  { keys: ["a", "\r"], expected: ["planning", "implementation", "testing"] },
  { keys: ["a", "a", "\r"], expected: ["planning"] },
  { keys: ["a", "i", "\r"], expected: ["planning"] },
] as const)(
  "planning stays included and bulk actions never add a step: %j",
  async ({ keys, expected }) => {
    const terminal = promptHarness();
    const result = stagesPrompt({ selected: ["planning"] }, terminal.context);
    await terminal.send(keys);
    expect(await result).toEqual(expected);
  },
);

test("saved custom steps keep their position and can be toggled", async () => {
  const terminal = promptHarness();
  const result = stagesPrompt(
    { selected: ["planning", "testing", "custom:Audit", "review"] },
    terminal.context,
  );
  await terminal.send([DOWN, DOWN, DOWN, " ", "\r"]);
  expect(await result).toEqual(["planning", "testing", "review"]);
  expect(terminal.screen()).toContain("Audit");
});

test("unchecked custom steps stay visible in the full order and can be selected later", async () => {
  const terminal = promptHarness();
  const order = ["planning", "implementation", "custom:Audit", "testing", "review"] as const;
  const result = stagesPrompt({ selected: ["planning"], order }, terminal.context);
  await terminal.send([DOWN, DOWN, " ", UP, " ", "\r"]);
  expect(await result).toEqual(["planning", "implementation", "custom:Audit"]);
  expect(terminal.screen()).toContain("◯ Audit");
});

test.for(["\r", " "])("the file action can be selected with Enter or Space: %j", async (key) => {
  const terminal = promptHarness();
  const result = stagesPrompt({ selected: ["planning", "custom:Audit"] }, terminal.context);
  await terminal.send([DOWN, DOWN, DOWN, DOWN, DOWN, key]);
  expect(await result).toEqual(["planning", "custom:Audit", CREATE_STEP_FILES]);
  expect(terminal.screen()).toContain("Create Markdown files for custom steps");
});

test("aborting the stage picker removes its keypress listener", async () => {
  const terminal = promptHarness();
  const result = stagesPrompt({ selected: ["planning"] }, terminal.context);
  await terminal.send([]);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortPromptError" });
  terminal.controller.abort();
  await rejected;
  expect(terminal.context.input.listenerCount("keypress")).toBe(0);
});
