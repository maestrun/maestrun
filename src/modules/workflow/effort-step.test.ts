import { expect } from "vitest";
import type { Model } from "../../contracts/workflow.js";
import { selectEffort } from "./effort-step.js";
import { CancelError } from "../../shared/errors.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const MODEL: Model = {
  id: "test",
  name: "Test",
  isDefault: true,
  efforts: ["low", "high"],
  defaultEffort: "low",
};

test.for(["codex", "claude"] as const)(
  "offers only model-supported efforts and restores the saved %s choice",
  async (executor, { project }) => {
    const script = scriptedUi(["high"]);
    expect(
      await selectEffort(
        wizardContext(project.cwd, script.ui),
        { executor, model: "test", effort: "high" },
        MODEL,
      ),
    ).toBe("high");
    expect(script.calls[0]?.choices).toEqual([
      { name: "Default (low)", value: "" },
      { name: "low", value: "low" },
      { name: "high", value: "high" },
    ]);
    expect(script.calls[0]?.initial).toBe("high");
  },
);

test("the native default clears an explicit effort", async ({ project }) => {
  const script = scriptedUi([""]);
  expect(
    await selectEffort(
      wizardContext(project.cwd, script.ui),
      { executor: "codex", model: "test", effort: "high" },
      MODEL,
    ),
  ).toBeUndefined();
});

test("models without effort support skip the prompt", async ({ project }) => {
  const script = scriptedUi([]);
  expect(
    await selectEffort(
      wizardContext(project.cwd, script.ui),
      { executor: "claude", model: "test" },
      { ...MODEL, efforts: [] },
    ),
  ).toBeUndefined();
  expect(script.calls).toHaveLength(0);
  expect(script.messages[0]).toContain("does not support effort");
});

test.for(["max", "invalid"])(
  "rejects an effort absent from model capabilities: %s",
  async (effort, { project }) => {
    const script = scriptedUi([effort]);
    await expect(
      selectEffort(
        wizardContext(project.cwd, script.ui),
        { executor: "codex", model: "test" },
        MODEL,
      ),
    ).rejects.toThrow("unsupported");
  },
);

test.for(["codex", "claude"] as const)(
  "manual %s identifiers keep explicit effort entry available",
  async (executor, { project }) => {
    const script = scriptedUi(["max"]);
    expect(
      await selectEffort(
        wizardContext(project.cwd, script.ui),
        { executor, model: "custom" },
        undefined,
      ),
    ).toBe("max");
    const choices = script.calls[0]?.choices?.map((choice) => choice.value);
    expect(choices).toContain("high");
    expect(choices?.includes("ultra")).toBe(executor === "codex");
    expect(script.calls[0]?.choices?.[0]?.name).toBe("Default (native CLI)");
    expect(script.messages[0]).toContain("unverified");
  },
);

test("an unavailable saved effort is not preselected", async ({ project }) => {
  const script = scriptedUi(["high"]);
  await selectEffort(
    wizardContext(project.cwd, script.ui),
    { executor: "codex", model: "test", effort: "ultra" },
    MODEL,
  );
  expect(script.calls[0]?.initial).toBe("");
});

test("cancelling effort selection exits", async ({ project }) => {
  const script = scriptedUi([new CancelError()]);
  await expect(
    selectEffort(
      wizardContext(project.cwd, script.ui),
      { executor: "codex", model: "test" },
      MODEL,
    ),
  ).rejects.toThrow("Cancelled");
});
