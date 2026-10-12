import { expect } from "vitest";
import { selectTargets } from "./target-step.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const TARGETS = {
  frontend: { executor: "claude", model: "claude-test-model", effort: "max" },
  backend: { executor: "codex", model: "codex-test", effort: "high" },
} as const;

test("selects an independent exact executor, model and effort for each target", async ({
  project,
}) => {
  const script = scriptedUi([
    true,
    "claude",
    "claude-test-model",
    "max",
    "codex",
    "codex-test",
    "high",
  ]);
  const config = await selectTargets(wizardContext(project.cwd, script.ui), CONFIG);
  expect(config).toEqual({ ...CONFIG, targets: TARGETS });
  expect(script.messages).toContain("frontend executor, model and effort");
  expect(script.messages).toContain("backend executor, model and effort");
  expect(script.remaining()).toBe(0);
});

test("preselects saved targets and allows removing advanced mode", async ({ project }) => {
  const script = scriptedUi([
    true,
    "claude",
    "claude-test-model",
    "max",
    "codex",
    "codex-test",
    "high",
  ]);
  expect(
    await selectTargets(wizardContext(project.cwd, script.ui), { ...CONFIG, targets: TARGETS }),
  ).toEqual({ ...CONFIG, targets: TARGETS });
  expect(script.calls[0]?.initial).toBe(true);
  expect(script.calls.find((call) => call.message === "Model identifier")?.initial).toBe(
    "claude-test-model",
  );
  expect(script.calls.find((call) => call.message === "Claude Code effort")?.initial).toBe("max");
  const disabled = scriptedUi([false]);
  expect(
    await selectTargets(wizardContext(project.cwd, disabled.ui), { ...CONFIG, targets: TARGETS }),
  ).toEqual(CONFIG);
});

test("Back from backend returns to frontend and retains its selections", async ({ project }) => {
  const script = scriptedUi([
    true,
    "claude",
    "claude-test-model",
    "max",
    new BackError(),
    "claude",
    "claude-revised-model",
    "high",
    "codex",
    "codex-test",
    "",
  ]);
  const config = await selectTargets(wizardContext(project.cwd, script.ui), CONFIG);
  expect(config.targets).toEqual({
    frontend: { executor: "claude", model: "claude-revised-model", effort: "high" },
    backend: { executor: "codex", model: "codex-test" },
  });
  expect(script.calls.filter((call) => call.message === "Model identifier")[1]?.initial).toBe(
    "claude-test-model",
  );
});

test("Back from frontend returns to the advanced mode choice", async ({ project }) => {
  const script = scriptedUi([true, new BackError(), false]);
  expect(await selectTargets(wizardContext(project.cwd, script.ui), CONFIG)).toEqual(CONFIG);
  expect(script.calls.map((call) => call.kind)).toEqual(["confirm", "select", "confirm"]);
});

test("cancelling backend assignment propagates without returning partial settings", async ({
  project,
}) => {
  const script = scriptedUi([true, "codex", "codex-test", "high", new CancelError()]);
  await expect(selectTargets(wizardContext(project.cwd, script.ui), CONFIG)).rejects.toThrow(
    "Cancelled",
  );
  expect(script.remaining()).toBe(0);
});

test("model discovery failure supports explicit identifiers for both targets", async ({
  project,
}) => {
  const script = scriptedUi([
    true,
    "codex",
    "custom-frontend",
    "ultra",
    "claude",
    "custom-backend",
    "max",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const config = await selectTargets(
    {
      ...context,
      catalog: async () => {
        throw new Error("Offline");
      },
    },
    CONFIG,
  );
  expect(config.targets).toEqual({
    frontend: { executor: "codex", model: "custom-frontend", effort: "ultra" },
    backend: { executor: "claude", model: "custom-backend", effort: "max" },
  });
});
