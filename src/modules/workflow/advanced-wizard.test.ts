import { expect, vi } from "vitest";
import type { Config } from "../../contracts/workflow.js";
import { BackError } from "../../shared/errors.js";
import { runWizard } from "./configure-workflow.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const ADVANCED: Config = {
  ...CONFIG,
  targets: {
    frontend: { executor: "codex", model: "codex-test", effort: "high" },
    backend: { executor: "codex", model: "codex-test", effort: "low" },
  },
};

const STAGE_SETTINGS = ["codex", "codex-test", ""] as const;
const CUSTOM = {
  id: "custom:Audit",
  executor: "codex",
  model: "codex-test",
  file: ".maestrun/steps/audit.md",
} as const;

test.for([true, false])(
  "adjusting stages preserves target settings through shared=%j assignments",
  async (shared, { project }) => {
    const script = scriptedUi([
      "adjust",
      ["testing"],
      shared,
      ...STAGE_SETTINGS,
      ...(shared ? [] : STAGE_SETTINGS),
      true,
      "codex",
      "codex-test",
      "high",
      "codex",
      "codex-test",
      ...["low", "sequential"],
    ]);
    const context = wizardContext(project.cwd, script.ui);
    const models = vi.fn(context.catalog);
    const setup = await runWizard({ ...context, saved: ADVANCED }, { ...context.services, models });
    expect(setup.config.targets).toEqual(ADVANCED.targets);
    expect(script.calls.find((call) => call.message.startsWith("Advanced mode"))?.initial).toBe(
      true,
    );
    expect(
      script.calls
        .filter((call) => call.message === "Codex effort")
        .slice(-2)
        .map((call) => call.initial),
    ).toEqual(["high", "low"]);
    expect(models).toHaveBeenCalledTimes(1);
  },
);

test("Back from advanced mode returns to stage settings without losing custom instruction files", async ({
  project,
}) => {
  const script = scriptedUi([
    "adjust",
    ["custom:Audit"],
    true,
    "codex",
    "codex-test",
    "",
    new BackError(),
    true,
    "codex",
    "codex-test",
    "",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const setup = await runWizard(
    { ...context, saved: { ...ADVANCED, stages: [...CONFIG.stages, CUSTOM] } },
    { ...context.services, models: context.catalog },
  );
  expect(setup.config.targets).toBeUndefined();
  expect(setup.config.stages[1]).toEqual(CUSTOM);
  expect(setup.files).toEqual([{ id: "custom:Audit", path: CUSTOM.file }]);
  expect(script.calls.filter((call) => call.message === "Executor")).toHaveLength(2);
});
