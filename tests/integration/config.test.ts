import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "../../src/config/index.js";
import { CONFIG } from "../helpers/context.js";
import { test } from "../helpers/project.js";

test.for([
  null,
  [],
  {},
  { version: 2 },
  { version: 1, stages: [] },
  { version: 1, stages: [null] },
])("rejects invalid or unsupported saved configuration: %j", (value) => {
  expect(() => parseConfig(value)).toThrow();
});

test.for([
  [{ id: "testing", executor: "codex", model: "model" }],
  [{ id: "planning", executor: "other", model: "model" }],
  [{ id: "planning", executor: "codex", model: "model with spaces" }],
  [
    { id: "planning", executor: "codex", model: "model" },
    { id: "planning", executor: "codex", model: "model" },
  ],
  [
    { id: "planning", executor: "codex", model: "model" },
    { id: "review", executor: "codex", model: "model" },
    { id: "testing", executor: "codex", model: "model" },
  ],
])(
  "rejects missing planning, unsupported assignments, duplicate and unordered stages",
  (stages) => {
    expect(() => parseConfig({ version: 1, stages })).toThrow();
  },
);

test("saves and reloads only versioned workflow assignments", async ({ project }) => {
  const saved = await loadConfig(project.cwd);
  expect(saved.config).toBeUndefined();
  await saveConfig(project.cwd, CONFIG, saved.snapshot);
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
  const content = await readFile(join(project.cwd, ".maestrun", "config.json"), "utf8");
  expect(JSON.parse(content)).toEqual(CONFIG);
  expect(content).not.toMatch(/requirements|credentials|usage/u);
});

test("saves and reloads different effort levels per executor and stage", async ({ project }) => {
  const config = parseConfig({
    version: 1,
    stages: [
      { id: "planning", executor: "claude", model: "claude-test", effort: "max" },
      { id: "review", executor: "codex", model: "codex-test", effort: "ultra" },
    ],
  });
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  expect((await loadConfig(project.cwd)).config).toEqual(config);
});

test.for([
  { executor: "codex", effort: "invalid" },
  { executor: "codex", effort: null },
  { executor: "codex", effort: 2 },
  { executor: "claude", effort: "none" },
  { executor: "claude", effort: "minimal" },
  { executor: "claude", effort: "ultra" },
])("rejects invalid effort settings: %j", (assignment) => {
  expect(() =>
    parseConfig({ version: 1, stages: [{ id: "planning", model: "test", ...assignment }] }),
  ).toThrow("invalid");
});

test("preserves malformed configuration", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun"));
  const path = join(project.cwd, ".maestrun", "config.json");
  await writeFile(path, "malformed config");
  await expect(loadConfig(project.cwd)).rejects.toThrow("invalid");
  expect(await readFile(path, "utf8")).toBe("malformed config");
});

test("rejects a configuration file symlink", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun"));
  await symlink(join(project.cwd, "application.ts"), join(project.cwd, ".maestrun", "config.json"));
  await expect(loadConfig(project.cwd)).rejects.toThrow("regular file");
});

test("rejects a configuration directory symlink without writing outside the project", async ({
  project,
}) => {
  await symlink(project.bin, join(project.cwd, ".maestrun"));
  await expect(loadConfig(project.cwd)).rejects.toThrow("not a file or symlink");
  await expect(saveConfig(project.cwd, CONFIG, { exists: false, content: "" })).rejects.toThrow(
    "not a file or symlink",
  );
});
