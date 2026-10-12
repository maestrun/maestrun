import { expect } from "vitest";
import { selectModel } from "./model-step.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { generateClaude } from "../executors/index.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test("preserves explicit manual entry when discovery fails", async ({ project }) => {
  const script = scriptedUi(["custom-codex-model"]);
  const context = wizardContext(project.cwd, script.ui);
  const model = await selectModel(
    {
      ...context,
      catalog: async () => {
        throw new UserError("Unavailable", "Enter model");
      },
    },
    { executor: "codex", model: "" },
  );
  expect(model).toBe("custom-codex-model");
  expect(script.messages.join("\n")).toContain("discovery is unavailable");
});

test("validates manual model identifiers and keeps entered values for correction", async ({
  project,
}) => {
  const script = scriptedUi(["", "invalid model", "claude-test-model"]);
  const model = await selectModel(wizardContext(project.cwd, script.ui), {
    executor: "claude",
    model: "",
  });
  expect(model).toBe("claude-test-model");
  expect(script.calls[2]?.initial).toBe("invalid model");
});

test("requires full Claude Code identifiers instead of model aliases", async ({ project }) => {
  const script = scriptedUi(["opusplan", "claude-test-model"]);
  const model = await selectModel(wizardContext(project.cwd, script.ui), {
    executor: "claude",
    model: "",
  });
  expect(model).toBe("claude-test-model");
  await expect(
    generateClaude({
      cwd: project.cwd,
      model: "opusplan",
      prompt: "Work",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("explicit model identifier");
});

test("offers an existing model absent from the current catalog without substitution", async ({
  project,
}) => {
  const script = scriptedUi(["previous-model"]);
  const model = await selectModel(wizardContext(project.cwd, script.ui), {
    executor: "codex",
    model: "previous-model",
  });
  expect(model).toBe("previous-model");
  expect(script.calls[0]?.initial).toBe("previous-model");
});

test("the model picker includes manual entry", async ({ project }) => {
  const script = scriptedUi(["", "custom-model"]);
  expect(
    await selectModel(wizardContext(project.cwd, script.ui), { executor: "codex", model: "" }),
  ).toBe("custom-model");
});

test("an empty model catalog uses explicit entry", async ({ project }) => {
  const script = scriptedUi(["custom-model"]);
  const context = wizardContext(project.cwd, script.ui);
  expect(
    await selectModel({ ...context, catalog: async () => [] }, { executor: "codex", model: "" }),
  ).toBe("custom-model");
});

test("cancelled model discovery does not open manual entry", async ({ project }) => {
  const script = scriptedUi([]);
  const context = wizardContext(project.cwd, script.ui);
  await expect(
    selectModel(
      {
        ...context,
        catalog: async () => {
          throw new CancelError();
        },
      },
      { executor: "codex", model: "" },
    ),
  ).rejects.toThrow("Cancelled");
  expect(script.calls).toHaveLength(0);
});
