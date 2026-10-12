import { expect } from "vitest";
import { BackError, CancelError } from "../../shared/errors.js";
import { runWizard } from "./configure-workflow.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test("assigns different executors and models to individual stages", async ({ project }) => {
  const script = scriptedUi([
    ["implementation"],
    false,
    "codex",
    "codex-test",
    "",
    "claude",
    "claude-test-model",
    "",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test" },
    { id: "implementation", executor: "claude", model: "claude-test-model" },
  ]);
  expect(script.calls.find((call) => call.kind === "stages")?.initial).toEqual([
    "planning",
    "implementation",
    "testing",
  ]);
  expect(script.remaining()).toBe(0);
});

test("Back from model selection lets the user change executor", async ({ project }) => {
  const script = scriptedUi([
    [],
    "codex",
    new BackError(),
    "claude",
    "claude-test-model",
    "",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages[0]?.executor).toBe("claude");
});

test("Back from executor assignment returns to stage selection", async ({ project }) => {
  const script = scriptedUi([
    [],
    new BackError(),
    ["testing"],
    true,
    "codex",
    "codex-test",
    "",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages.map((stage) => stage.id)).toEqual(["planning", "testing"]);
});

test("Back during individual assignments retains the earlier selection", async ({ project }) => {
  const script = scriptedUi([
    ["testing"],
    false,
    "codex",
    "codex-test",
    "",
    new BackError(),
    "claude",
    "claude-planning",
    "",
    "codex",
    "codex-test",
    "",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages[0]?.model).toBe("claude-planning");
  expect(draft.config.stages[1]?.model).toBe("codex-test");
});

test("saved configuration prepopulates adjustment and returns after model selection", async ({
  project,
}) => {
  const script = scriptedUi(["adjust", [], "codex", "codex-test", "", false, "sequential"]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: CONFIG },
    { ...context.services, models: context.catalog },
  );
  expect(script.calls.find((call) => call.kind === "stages")?.initial).toEqual(["planning"]);
  expect(draft.config).toEqual({ ...CONFIG, execution: { mode: "sequential", concurrency: 2 } });
  expect(
    script.calls.some((call) => call.kind === "paste" || call.message === "Describe the work"),
  ).toBe(false);
  expect(script.remaining()).toBe(0);
});

test("cancelling from the first step never asks for executor or model", async ({ project }) => {
  const script = scriptedUi([new CancelError()]);
  const context = wizardContext(project.cwd, script.ui);
  await expect(runWizard({ ...context, saved: undefined }, context.services)).rejects.toThrow(
    "Cancelled",
  );
  expect(script.calls).toHaveLength(1);
});
