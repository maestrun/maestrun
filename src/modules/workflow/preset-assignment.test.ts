import { expect, test } from "vitest";
import { initialAssignment } from "./preset-assignment.js";
import { initialWorkflow } from "./workflow-step.js";
import type { Config } from "../../contracts/workflow.js";

const SAVED: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "planning-model", effort: "ultra" }],
};

test("presets extend available choices without selecting them or duplicating saved steps", () => {
  const saved: Config = {
    ...SAVED,
    stages: [...SAVED.stages, { id: "custom:Audit", executor: "codex", model: "project-model" }],
  };
  expect(initialWorkflow(saved, [{ name: "audit" }, { name: "QA" }, { name: "Review" }])).toEqual({
    selected: ["planning", "custom:Audit"],
    order: ["planning", "custom:Audit", "implementation", "testing", "qa", "review"],
  });
});

test("saved project assignments win over preset defaults", () => {
  expect(
    initialAssignment(SAVED, "planning", [
      { name: "Planning", executor: "claude", model: "other-model", effort: "low" },
    ]),
  ).toEqual(SAVED.stages[0]);
});

test("partial presets inherit compatible settings and clear incompatible fallbacks", () => {
  expect(initialAssignment(SAVED, "custom:Audit", [{ name: "Audit" }])).toMatchObject({
    executor: "codex",
    model: "planning-model",
    effort: "ultra",
  });
  expect(initialAssignment(SAVED, "custom:Audit", [{ name: "Audit", executor: "claude" }])).toEqual(
    {
      executor: "claude",
      model: "",
    },
  );
  expect(
    initialAssignment(SAVED, "custom:Audit", [{ name: "Audit", model: "audit-model" }]),
  ).toEqual({
    executor: "codex",
    model: "audit-model",
  });
  expect(initialAssignment(undefined, "custom:Audit", [{ name: "Audit", effort: "high" }])).toEqual(
    {
      executor: "codex",
      model: "",
      effort: "high",
    },
  );
});
