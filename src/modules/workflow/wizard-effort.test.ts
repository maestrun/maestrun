import { expect, vi } from "vitest";
import type { Config } from "../../contracts/workflow.js";
import { runWizard } from "./configure-workflow.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const RESPONSES = [
  ["implementation", "testing"],
  false,
  "codex",
  "codex-test",
  "high",
  "claude",
  "claude-test",
  "max",
  "codex",
  "codex-test",
  "low",
  false,
  "sequential",
] as const;
const SAVED_EFFORTS: Config = {
  version: 1,
  stages: [
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    { id: "review", executor: "codex", model: "codex-test", effort: "low" },
  ],
};

test("keeps catalogs separate and saves each stage's model and effort", async ({ project }) => {
  const script = scriptedUi(RESPONSES);
  const context = wizardContext(project.cwd, script.ui);
  const models = vi.fn(async (executor: "codex" | "claude" | "copilot" | "grok") =>
    executor === "codex"
      ? context.catalog(executor)
      : [
          {
            id: "claude-test",
            name: "Test Claude",
            isDefault: true,
            efforts: ["low", "max"] as const,
          },
        ],
  );
  const draft = await runWizard({ ...context, saved: undefined }, { ...context.services, models });
  expect(draft.config.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    { id: "implementation", executor: "claude", model: "claude-test", effort: "max" },
    { id: "testing", executor: "codex", model: "codex-test", effort: "low" },
  ]);
  expect(models.mock.calls.map(([executor]) => executor)).toEqual(["codex", "claude"]);
  expect(script.remaining()).toBe(0);
});

test("shared assignments include effort for every selected stage", async ({ project }) => {
  const script = scriptedUi([
    ["testing"],
    true,
    "codex",
    "codex-test",
    "high",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages.map((stage) => stage.effort)).toEqual(["high", "high"]);
});

test("different saved efforts disable the default shared-assignment shortcut", async ({
  project,
}) => {
  const script = scriptedUi([
    "adjust",
    ["review"],
    true,
    "codex",
    "codex-test",
    "high",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  await runWizard(
    { ...context, saved: SAVED_EFFORTS },
    { ...context.services, models: context.catalog },
  );
  expect(
    script.calls.find((call) => call.message.startsWith("Use the same executor"))?.initial,
  ).toBe(false);
});
