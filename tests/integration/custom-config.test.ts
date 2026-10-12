import { expect } from "vitest";
import { parseConfig, loadConfig, saveConfig } from "../../src/config/index.js";
import { MAX_STEP_NAME_LENGTH } from "../../src/contracts/workflow.js";
import { workflowTable } from "../../src/modules/planning/index.js";
import { test } from "../helpers/project.js";

test("saves and reloads custom steps between built-in stages", async ({ project }) => {
  const config = parseConfig({
    version: 1,
    stages: [
      { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
      { id: "custom:Research", executor: "claude", model: "claude-test", effort: "max" },
      { id: "implementation", executor: "codex", model: "codex-test" },
      { id: "custom:Security audit", executor: "claude", model: "claude-test", effort: "high" },
      { id: "review", executor: "codex", model: "codex-test" },
    ],
  });
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  expect((await loadConfig(project.cwd)).config).toEqual(config);
});

test.for([
  "unknown",
  "custom:",
  "custom: ",
  "custom:Planning",
  "custom:Review",
  "custom: name",
  `custom:${"a".repeat(MAX_STEP_NAME_LENGTH + 1)}`,
  "custom:two\nlines",
  "custom:\u001b",
])("rejects an invalid saved step: %j", (id) => {
  expect(() =>
    parseConfig({
      version: 1,
      stages: [
        { id: "planning", executor: "codex", model: "codex-test" },
        { id, executor: "codex", model: "codex-test" },
      ],
    }),
  ).toThrow("invalid");
});

test("rejects duplicate custom labels regardless of case", () => {
  expect(() =>
    parseConfig({
      version: 1,
      stages: [
        { id: "planning", executor: "codex", model: "codex-test" },
        { id: "custom:Audit", executor: "codex", model: "codex-test" },
        { id: "custom:audit", executor: "claude", model: "claude-test" },
      ],
    }),
  ).toThrow("invalid");
});

test("custom steps cannot precede planning or reorder built-in stages", () => {
  for (const ids of [
    ["custom:Research", "planning"],
    ["planning", "review", "custom:Audit", "testing"],
  ]) {
    expect(() =>
      parseConfig({
        version: 1,
        stages: ids.map((id) => ({ id, executor: "codex", model: "codex-test" })),
      }),
    ).toThrow("invalid");
  }
});

test("escapes custom labels in Markdown workflow tables", () => {
  const config = parseConfig({
    version: 1,
    stages: [
      { id: "planning", executor: "codex", model: "codex-test" },
      { id: "custom:QA | docs", executor: "claude", model: "claude-test", effort: "max" },
    ],
  });
  expect(workflowTable(config)).toContain("| QA \\| docs | Claude Code | claude-test | max |");
});

test("saves, reloads and renders a custom step's instruction file", async ({ project }) => {
  const config = parseConfig({
    version: 1,
    stages: [
      { id: "planning", executor: "codex", model: "codex-test" },
      {
        id: "custom:Audit",
        executor: "codex",
        model: "codex-test",
        file: ".maestrun/steps/audit.md",
      },
    ],
  });
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  expect((await loadConfig(project.cwd)).config).toEqual(config);
  expect(workflowTable(config)).toContain("Instructions file");
  expect(workflowTable(config)).toContain(".maestrun/steps/audit.md");
});

test.for([
  null,
  "",
  "../audit.md",
  "/tmp/audit.md",
  ".maestrun/steps/nested/audit.md",
  ".maestrun/steps/audit.txt",
])("rejects an invalid custom step file reference: %j", (file) => {
  expect(() =>
    parseConfig({
      version: 1,
      stages: [
        { id: "planning", executor: "codex", model: "codex-test" },
        { id: "custom:Audit", executor: "codex", model: "codex-test", file },
      ],
    }),
  ).toThrow("invalid");
});

test("built-in stages cannot have custom step files", () => {
  expect(() =>
    parseConfig({
      version: 1,
      stages: [
        {
          id: "planning",
          executor: "codex",
          model: "codex-test",
          file: ".maestrun/steps/audit.md",
        },
      ],
    }),
  ).toThrow("invalid");
});
