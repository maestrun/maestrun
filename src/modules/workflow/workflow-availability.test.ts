import { expect } from "vitest";
import { BackError } from "../../shared/errors.js";
import { ADD_CUSTOM_STEP } from "../../shared/ui.types.js";
import { runWizard } from "./configure-workflow.js";
import { selectWorkflow } from "./workflow-step.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

const AUDIT_ORDER = ["planning", "implementation", "testing", "custom:Audit"] as const;
const NOTES_ORDER = [
  "planning",
  "implementation",
  "testing",
  "custom:Audit",
  "custom:Notes",
] as const;
const NOTES_CANDIDATES = [...AUDIT_ORDER, "custom:Notes"] as const;
const SETTINGS = ["codex", "codex-test", "high"] as const;

test("orders a new step among unchecked built-in stages before selecting them", async ({
  project,
}) => {
  const script = scriptedUi([[ADD_CUSTOM_STEP], "Audit", AUDIT_ORDER, ["testing", "custom:Audit"]]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"]);
  expect(workflow).toEqual({
    selected: ["planning", "testing", "custom:Audit"],
    order: AUDIT_ORDER,
  });
  expect(script.calls.find((call) => call.kind === "orderStep")?.initial).toEqual([
    "planning",
    "implementation",
    "testing",
    "custom:Audit",
  ]);
  expect(script.calls.filter((call) => call.kind === "stages")[1]?.initial).toEqual([
    "planning",
    "custom:Audit",
  ]);
  expect(script.remaining()).toBe(0);
});

test("unchecked custom steps remain available while adding and ordering more steps", async ({
  project,
}) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    AUDIT_ORDER,
    [ADD_CUSTOM_STEP],
    "Notes",
    NOTES_ORDER,
    ["testing", "custom:Audit", "custom:Notes"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"]);
  expect(workflow).toEqual({
    selected: ["planning", "testing", "custom:Audit", "custom:Notes"],
    order: NOTES_ORDER,
  });
  expect(script.calls.filter((call) => call.kind === "orderStep")[1]?.initial).toEqual(
    NOTES_CANDIDATES,
  );
  expect(script.calls.filter((call) => call.kind === "stages")[2]?.initial).toEqual([
    "planning",
    "custom:Notes",
  ]);
  expect(script.calls.filter((call) => call.kind === "stages")[2]?.order).toEqual(NOTES_ORDER);
  expect(script.remaining()).toBe(0);
});

test("unchecked custom names stay reserved in the available workflow", async ({ project }) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "audit",
    "Notes",
    NOTES_ORDER,
    ["custom:Audit", "custom:Notes"],
  ]);
  const workflow = await selectWorkflow(wizardContext(project.cwd, script.ui), ["planning"], {
    order: AUDIT_ORDER,
  });
  expect(workflow.selected).toEqual(["planning", "custom:Audit", "custom:Notes"]);
  expect(script.messages[0]).toContain("already exists");
  expect(script.remaining()).toBe(0);
});

test("Back preserves unchecked steps and only the final selection gets model assignments", async ({
  project,
}) => {
  const script = scriptedUi([
    [ADD_CUSTOM_STEP],
    "Audit",
    AUDIT_ORDER,
    ["implementation"],
    new BackError(),
    ["testing", "custom:Audit"],
    true,
    ...SETTINGS,
    false,
    "sequential",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const draft = await runWizard(
    { ...context, saved: undefined },
    { ...context.services, models: context.catalog },
  );
  const ids = draft.config.stages.map((stage) => stage.id);
  expect(ids).toEqual(["planning", "testing", "custom:Audit"]);
  const revisited = script.calls.filter((call) => call.kind === "stages")[2];
  expect(revisited?.initial).toEqual(["planning", "implementation"]);
  expect(revisited?.order).toEqual(AUDIT_ORDER);
  expect(script.remaining()).toBe(0);
});
