import { expect } from "vitest";
import { MAX_STEP_NAME_LENGTH, workflowOrder } from "../../contracts/workflow.js";
import { ADD_CUSTOM_STEP } from "../../shared/ui.types.js";
import { initialWorkflow, selectWorkflow } from "./workflow-step.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const MULTIPLE_STEPS = [
  "planning",
  "implementation",
  "custom:Security audit",
  "custom:Release notes",
  "review",
] as const;

test("new workflows select and offer only planning, implementation and tests", () => {
  expect(initialWorkflow(undefined)).toEqual({
    selected: ["planning", "implementation", "testing"],
    order: ["planning", "implementation", "testing"],
  });
});

test("saved QA and Review steps retain their built-in order", () => {
  expect(workflowOrder(["planning", "qa", "review"])).toEqual([
    "planning",
    "implementation",
    "testing",
    "qa",
    "review",
  ]);
});

test("adds multiple named steps at their chosen positions", async ({ project }) => {
  const script = scriptedUi([
    ["implementation", "review", ADD_CUSTOM_STEP],
    "Security audit",
    workflowOrder(["planning", "implementation", "custom:Security audit", "review"]),
    ["implementation", "custom:Security audit", "review", ADD_CUSTOM_STEP],
    "Release notes",
    workflowOrder(MULTIPLE_STEPS),
    ["implementation", "custom:Security audit", "custom:Release notes", "review"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), [
    "planning",
    "review",
  ]);
  expect(workflow.selected).toEqual(MULTIPLE_STEPS);
  expect(script.calls.filter((call) => call.kind === "stages")[1]?.initial).toEqual([
    "planning",
    "implementation",
    "custom:Security audit",
    "review",
  ]);
  expect(script.remaining()).toBe(0);
});

test.for([
  "",
  "Planning",
  "Review",
  "a".repeat(MAX_STEP_NAME_LENGTH + 1),
  "two\nlines",
  "\u001b[31mname",
  "invisible\u200b",
])("invalid custom names can be corrected: %j", async (name, { project }) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    name,
    "Valid name",
    workflowOrder(["planning", "custom:Valid name"]),
    ["custom:Valid name"],
  ]);
  expect(
    (await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).selected,
  ).toEqual(["planning", "custom:Valid name"]);
  expect(script.messages[0]).toContain("Built-in stage names are reserved");
});

test("rejects duplicate custom names without changing the existing step", async ({ project }) => {
  const script = scriptedUi([
    ["custom:Audit", ADD_CUSTOM_STEP],
    "audit",
    "Release notes",
    workflowOrder(["planning", "custom:Audit", "custom:Release notes"]),
    ["custom:Audit", "custom:Release notes"],
  ]);
  expect(
    (await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning", "custom:Audit"]))
      .selected,
  ).toEqual(["planning", "custom:Audit", "custom:Release notes"]);
  expect(script.messages[0]).toContain("already exists");
});

test("trims custom names and preserves Unicode labels", async ({ project }) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "  Revisão de código  ",
    workflowOrder(["planning", "custom:Revisão de código"]),
    ["custom:Revisão de código"],
  ]);
  expect(
    (await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).selected,
  ).toEqual(["planning", "custom:Revisão de código"]);
});

test("deselects saved custom steps and retains the remaining order", async ({ project }) => {
  const script = scriptedUi([["review", "custom:Audit", "implementation"]]);
  expect(
    (
      await selectWorkflow(wizardContext(project.cwd, script.ui), [
        "planning",
        "custom:Research",
        "implementation",
        "custom:Audit",
        "review",
      ])
    ).selected,
  ).toEqual(["planning", "implementation", "custom:Audit", "review"]);
});

test("custom order includes every current step and the new step", async ({ project }) => {
  const script = scriptedUi([
    ["testing", "custom:Audit", "review", ADD_CUSTOM_STEP],
    "Release notes",
    workflowOrder(["planning", "testing", "custom:Audit", "custom:Release notes", "review"]),
    ["testing", "custom:Audit", "custom:Release notes", "review"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), [
    "planning",
    "testing",
    "custom:Audit",
    "review",
  ]);
  expect(script.calls.find((call) => call.kind === "orderStep")?.initial).toEqual([
    "planning",
    "implementation",
    "testing",
    "custom:Audit",
    "review",
    "custom:Release notes",
  ]);
  expect(workflow.selected).toEqual([
    "planning",
    "testing",
    "custom:Audit",
    "custom:Release notes",
    "review",
  ]);
});
