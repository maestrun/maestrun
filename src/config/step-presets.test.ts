import { expect, test } from "vitest";
import { parseStepPresets, stepPresetId } from "./step-presets.js";

test("accepts name-only and partial assignment presets", () => {
  expect(
    parseStepPresets([
      "QA",
      { name: "Audit", model: "audit-model" },
      { name: "Review", executor: "claude", effort: "high" },
      { name: "Release notes", effort: "low" },
    ]),
  ).toEqual([
    { name: "QA" },
    { name: "Audit", model: "audit-model" },
    { name: "Review", executor: "claude", effort: "high" },
    { name: "Release notes", effort: "low" },
  ]);
  expect(stepPresetId("QA")).toBe("qa");
  expect(stepPresetId("Tests")).toBe("testing");
  expect(stepPresetId("Audit")).toBe("custom:Audit");
});

test.for([
  null,
  {},
  [null],
  [""],
  [" Audit "],
  ["bad\nname"],
  ["a".repeat(81)],
  ["QA", "qa"],
  ["Tests", "testing"],
  ["Audit", { name: "audit" }],
  [{ name: "Audit", executor: "unknown" }],
  [{ name: "Audit", model: "bad model" }],
  [{ name: "Audit", executor: "copilot", model: "auto" }],
  [{ name: "Audit", effort: "extreme" }],
  [{ name: "Audit", executor: "claude", effort: "ultra" }],
  [{ name: "Audit", typo: true }],
])("rejects invalid presets: %j", (value) => {
  expect(() => parseStepPresets(value)).toThrow("Invalid stepPresets");
});
