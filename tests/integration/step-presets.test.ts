import os from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { configure, loadConfig, saveConfig } from "../../src/config/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
import { CONFIG } from "../helpers/context.js";

test("global presets support named edits and reject invalid writes without changing files", async ({
  project,
}) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await configure(project.cwd, ["global", "stepPresets", '["Audit", "Release notes"]']);
  await configure(project.cwd, ["global", "stepPresets", "Audit", "model", "audit-model"]);
  await configure(project.cwd, ["global", "stepPresets.0.effort", "high"]);
  const path = join(os.homedir(), ".maestrun/config.json");
  const before = await readFile(path, "utf8");
  expect(JSON.parse(before).stepPresets).toEqual([
    { name: "Audit", model: "audit-model", effort: "high" },
    "Release notes",
  ]);
  await expect(
    configure(project.cwd, ["global", "stepPresets.0.executor", "invalid"]),
  ).rejects.toThrow("Invalid stepPresets");
  await expect(configure(project.cwd, ["global", "stepPresets", '["QA", "qa"]'])).rejects.toThrow(
    "Invalid stepPresets",
  );
  expect(await readFile(path, "utf8")).toBe(before);
  await configure(project.cwd, ["global", "stepPresets.0.effort", "null"]);
  expect(JSON.parse(await readFile(path, "utf8")).stepPresets[0]).not.toHaveProperty("effort");
  await configure(project.cwd, ["global", "stepPresets", "null"]);
  expect(JSON.parse(await readFile(path, "utf8"))).not.toHaveProperty("stepPresets");
});

test("initialization offers reusable steps and prefills optional model and effort settings", async ({
  project,
}) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await installExecutors(project);
  await configure(project.cwd, ["global", "stepPresets", JSON.stringify(PRESETS)]);
  const globalPath = join(os.homedir(), ".maestrun/config.json");
  const before = await readFile(globalPath, "utf8");
  const script = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expectPresetPrompts(script);
  expect((await loadConfig(project.cwd)).config?.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test" },
    { id: "custom:Audit", executor: "codex", model: "audit-model", effort: "high" },
    { id: "review", executor: "codex", model: "codex-test", effort: "low" },
  ]);
  const local = JSON.parse(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8"));
  expect(local).not.toHaveProperty("stepPresets");
  expect(await readFile(globalPath, "utf8")).toBe(before);
  expect(script.remaining()).toBe(0);
});

test("presets are global only and project writes preserve the saved workflow", async ({
  project,
}) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await readFile(path, "utf8");
  await expect(configure(project.cwd, ["stepPresets", '["Audit"]'])).rejects.toThrow(
    "global setting",
  );
  expect(await readFile(path, "utf8")).toBe(before);
  await configure(project.cwd, ["global", "stepPresets", '["QA"]']);
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
});

const PRESETS = [
  "Release notes",
  { name: "Audit", executor: "codex", model: "audit-model", effort: "high" },
  { name: "Review", effort: "low" },
];

const RESPONSES = [
  ["custom:Audit", "review"],
  false,
  "codex",
  "codex-test",
  "",
  "codex",
  "audit-model",
  "high",
  "codex",
  "codex-test",
  "low",
  false,
  "sequential",
] as const;

function expectPresetPrompts(script: ReturnType<typeof scriptedUi>): void {
  const picker = script.calls.find((call) => call.kind === "stages");
  expect(picker?.initial).toEqual(["planning", "implementation", "testing"]);
  expect(picker?.order).toEqual([
    "planning",
    "implementation",
    "testing",
    "custom:Release notes",
    "custom:Audit",
    "review",
  ]);
  expect(script.calls.find((call) => call.message.startsWith("Use the same"))?.initial).toBe(false);
  expect(script.calls.filter((call) => call.kind === "search").map((call) => call.initial)).toEqual(
    ["codex-test", "audit-model", "codex-test"],
  );
  expect(
    script.calls.filter((call) => call.message === "Codex effort").map((call) => call.initial),
  ).toEqual(["", "high", "low"]);
}
