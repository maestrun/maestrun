import { expect } from "vitest";
import { BackError, CancelError } from "../../shared/errors.js";
import { runPlanWizard } from "./plan-wizard.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test("Back from plan review returns to requirements and reloads project guidance", async ({
  project,
}) => {
  const script = scriptedUi([
    "paste",
    "Original work",
    new BackError(),
    "paste",
    "Revised work",
    true,
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runPlanWizard({ ...context, config: CONFIG, planExists: false });
  expect(draft.requirements.text).toBe("Revised work");
  expect(script.calls.filter((call) => call.kind === "paste")[1]?.initial).toBe("Original work");
  expect(draft.config).toEqual(CONFIG);
  expect(script.remaining()).toBe(0);
});

test("Back from the first planning question exits cleanly", async ({ project }) => {
  const script = scriptedUi([new BackError()]);
  await expect(
    runPlanWizard({ ...wizardContext(project.cwd, script.ui), config: CONFIG, planExists: false }),
  ).rejects.toThrow("Cancelled");
});

test("cancelling plan review stops without changing the saved workflow", async ({ project }) => {
  const script = scriptedUi(["paste", "New work", new CancelError()]);
  await expect(
    runPlanWizard({ ...wizardContext(project.cwd, script.ui), config: CONFIG, planExists: false }),
  ).rejects.toThrow("Cancelled");
});
