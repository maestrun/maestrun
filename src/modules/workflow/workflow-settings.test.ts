import { expect } from "vitest";
import { workflowOrder } from "../../contracts/workflow.js";
import { BackError } from "../../shared/errors.js";
import { ADD_CUSTOM_STEP } from "../../shared/ui.types.js";
import { runWizard } from "./configure-workflow.js";
import { selectWorkflow } from "./workflow-step.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const SETTINGS = ["codex", "codex-test", "high"] as const;
const SHARED_RESPONSES = [
  ["implementation", ADD_CUSTOM_STEP],
  "Audit",
  workflowOrder(["planning", "custom:Audit", "implementation"]),
  ["custom:Audit", "implementation"],
  true,
  ...SETTINGS,
  false,
  "sequential",
] as const;

test("selects the name and order before asking for any model settings", async ({ project }) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    workflowOrder(["planning", "custom:Audit"]),
    ["custom:Audit"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"]);
  expect(workflow.selected).toEqual(["planning", "custom:Audit"]);
  expect(script.calls.map((call) => call.message)).toEqual([
    "stages",
    "Custom step name",
    "Order custom:Audit",
    "stages",
  ]);
  expect(script.remaining()).toBe(0);
});

test("shared assignments include custom steps after the workflow order is chosen", async ({
  project,
}) => {
  const script = scriptedUi(SHARED_RESPONSES);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    { id: "custom:Audit", executor: "codex", model: "codex-test", effort: "high" },
    { id: "implementation", executor: "codex", model: "codex-test", effort: "high" },
  ]);
  expect(script.calls.filter((call) => call.message === "Executor")).toHaveLength(1);
  expect(script.calls.findIndex((call) => call.message === "Executor")).toBeGreaterThan(
    script.calls.findLastIndex((call) => call.kind === "stages"),
  );
  expect(script.remaining()).toBe(0);
});

test("returning from model settings preserves the new step and its position", async ({
  project,
}) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    workflowOrder(["planning", "custom:Audit"]),
    ["custom:Audit"],
    new BackError(),
    ["custom:Audit"],
    true,
    "codex",
    "codex-test",
    "low",
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  expect(draft.config.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test", effort: "low" },
    { id: "custom:Audit", executor: "codex", model: "codex-test", effort: "low" },
  ]);
  expect(script.remaining()).toBe(0);
});

test("deselecting a new step leaves only the remaining workflow stages", async ({ project }) => {
  const script = scriptedUi([["review"]]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), [
    "planning",
    "custom:Audit",
    "review",
  ]);
  expect(workflow.selected).toEqual(["planning", "review"]);
  expect(script.remaining()).toBe(0);
});

test("ordering cannot change the order of existing built-in stages", async ({ project }) => {
  const script = scriptedUi([
    ["implementation", "review", ADD_CUSTOM_STEP],
    "Audit",
    ["planning", "review", "implementation", "custom:Audit"],
  ]);
  await expect(selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"])).rejects.toThrow(
    "order is invalid",
  );
});
