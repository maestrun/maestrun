import { expect } from "vitest";
import { workflowOrder } from "../../contracts/workflow.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { ADD_CUSTOM_STEP } from "../../shared/ui.types.js";
import { selectWorkflow } from "./workflow-step.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test("Back from the custom name returns to stage selection", async ({ project }) => {
  const script = scriptedUi([[ADD_CUSTOM_STEP], new BackError(), ["testing"]]);
  expect(
    (await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).selected,
  ).toEqual(["planning", "testing"]);
  expect(script.calls.map((call) => call.kind)).toEqual(["stages", "input", "stages"]);
});

test("Back from ordering returns to the entered name for editing", async ({ project }) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    new BackError(),
    "Revised audit",
    workflowOrder(["planning", "custom:Revised audit"]),
    ["custom:Revised audit"],
  ]);
  expect(
    (await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).selected,
  ).toEqual(["planning", "custom:Revised audit"]);
  expect(script.calls.filter((call) => call.kind === "input")[1]?.initial).toBe("Audit");
});

test("Back through ordering and naming returns without adding a partial step", async ({
  project,
}) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    new BackError(),
    new BackError(),
    ["testing"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"]);
  expect(workflow.selected).toEqual(["planning", "testing"]);
  expect(script.calls.filter((call) => call.kind === "input")[1]?.initial).toBe("Audit");
  expect(script.remaining()).toBe(0);
});

test.for([[new CancelError()], ["Audit", new CancelError()]] as const)(
  "cancelling custom step entry stops the workflow",
  async (responses, { project }) => {
    const script = scriptedUi([[ADD_CUSTOM_STEP], ...responses]);
    await expect(
      selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"]),
    ).rejects.toThrow("Cancelled");
    expect(script.remaining()).toBe(0);
  },
);

test.for([
  ["planning", "custom:Other"],
  ["custom:Audit", "planning"],
  ["planning", "custom:Audit", "custom:Audit"],
  ["planning"],
] as const)("rejects an invalid workflow order: %j", async (order, { project }) => {
  const script = scriptedUi([[ADD_CUSTOM_STEP], "Audit", order]);
  await expect(selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).rejects.toThrow(
    "order is invalid",
  );
});
