import { expect, vi } from "vitest";
import { BackError, CancelError } from "../../shared/errors.js";
import { selectModelSettings } from "./model-step.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test("offers native Claude models and their own effort levels", async ({ project }) => {
  const script = scriptedUi(["claude-test", "max"]);
  const catalog = vi.fn(async () => [
    { id: "claude-test", name: "Test Claude", isDefault: true, efforts: ["low", "max"] as const },
  ]);
  const assignment = await selectModelSettings(
    { ...wizardContext(project.cwd, script.ui), catalog },
    { executor: "claude", model: "" },
  );
  expect(assignment).toEqual({ executor: "claude", model: "claude-test", effort: "max" });
  expect(catalog).toHaveBeenCalledWith("claude");
  expect(script.calls[0]).toMatchObject({ kind: "search", initial: "claude-test" });
  expect(script.calls[0]?.choices?.[0]?.value).toBe("claude-test");
  expect(script.calls[1]?.choices?.map((choice) => choice.value)).toEqual(["", "low", "max"]);
});

test("Back from effort returns to models and switching models clears the old effort", async ({
  project,
}) => {
  const script = scriptedUi(["codex-test", new BackError(), "codex-other", "ultra"]);
  const context = wizardContext(project.cwd, script.ui);
  const catalog = vi.fn(async () => [
    ...(await context.catalog("codex")),
    { id: "codex-other", name: "Other", isDefault: false, efforts: ["ultra"] as const },
  ]);
  expect(
    await selectModelSettings(
      { ...context, catalog },
      { executor: "codex", model: "codex-test", effort: "high" },
    ),
  ).toEqual({ executor: "codex", model: "codex-other", effort: "ultra" });
  const efforts = script.calls.filter((call) => call.message === "Codex effort");
  expect(efforts.map((call) => call.initial)).toEqual(["high", ""]);
  expect(script.calls[2]?.initial).toBe("codex-test");
  expect(catalog).toHaveBeenCalledTimes(1);
});

test("manual Claude entry retains effort selection when discovery fails", async ({ project }) => {
  const script = scriptedUi(["claude-custom", "high"]);
  const assignment = await selectModelSettings(
    {
      ...wizardContext(project.cwd, script.ui),
      catalog: async () => {
        throw new Error("Unavailable");
      },
    },
    { executor: "claude", model: "" },
  );
  expect(assignment).toEqual({ executor: "claude", model: "claude-custom", effort: "high" });
  expect(script.messages.join("\n")).toContain("Claude Code model discovery is unavailable");
});

test("the selected native default removes a saved effort from the assignment", async ({
  project,
}) => {
  const script = scriptedUi(["codex-test", ""]);
  expect(
    await selectModelSettings(wizardContext(project.cwd, script.ui), {
      executor: "codex",
      model: "codex-test",
      effort: "high",
    }),
  ).toEqual({ executor: "codex", model: "codex-test" });
});

test("cancelling effort selection never reopens models", async ({ project }) => {
  const script = scriptedUi(["codex-test", new CancelError()]);
  await expect(
    selectModelSettings(wizardContext(project.cwd, script.ui), { executor: "codex", model: "" }),
  ).rejects.toThrow("Cancelled");
  expect(script.calls.filter((call) => call.kind === "search")).toHaveLength(1);
});
