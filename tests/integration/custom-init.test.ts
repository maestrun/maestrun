import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import { workflowOrder } from "../../src/contracts/workflow.js";
import type { Config } from "../../src/contracts/workflow.js";
import { CancelError } from "../../src/shared/errors.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { ADD_CUSTOM_STEP } from "../../src/shared/ui.types.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CUSTOM_CONFIG: Config = {
  version: 1,
  stages: [
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    { id: "custom:Security audit", executor: "claude", model: "claude-test-model", effort: "max" },
  ],
};
const RESPONSES = [
  [ADD_CUSTOM_STEP],
  "Security audit",
  workflowOrder(["planning", "custom:Security audit"]),
  ["custom:Security audit"],
  false,
  "codex",
  "codex-test",
  "high",
  "claude",
  "claude-test-model",
  "max",
  false,
  "sequential",
] as const;
const CUSTOM_ROW = "| Security audit | Claude Code | claude-test-model | max |";

test("init assigns custom executors and effort and includes them in the planning request", async ({
  project,
}) => {
  await installExecutors(project);
  const script = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config).toMatchObject(CUSTOM_CONFIG);
  await createPlan({
    cwd: project.cwd,
    ui: scriptedUi(["paste", "New work", true]).ui,
    signal: new AbortController().signal,
  });
  expect((await loadConfig(project.cwd)).config).toMatchObject(CUSTOM_CONFIG);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toContain(CUSTOM_ROW);
  const records = (await readFile(project.log, "utf8")).trim().split("\n");
  expect(records).toHaveLength(1);
  const call: unknown = JSON.parse(records[0] ?? "");
  expect(call).toMatchObject({ executor: "codex", input: expect.stringContaining(CUSTOM_ROW) });
  expect(script.remaining()).toBe(0);
});

test("saved custom steps can be reused without assignment prompts", async ({ project }) => {
  await installExecutors(project);
  await saveConfig(project.cwd, CUSTOM_CONFIG, { exists: false, content: "" });
  const script = scriptedUi(["paste", "New work", true]);
  await createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config).toMatchObject(CUSTOM_CONFIG);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toContain(CUSTOM_ROW);
  expect(script.calls.some((call) => call.kind === "stages" || call.message === "Executor")).toBe(
    false,
  );
  expect(script.remaining()).toBe(0);
});

test("adjusting a saved custom workflow preselects its steps and effort", async ({ project }) => {
  await installExecutors(project);
  await saveConfig(project.cwd, CUSTOM_CONFIG, { exists: false, content: "" });
  const script = scriptedUi([
    "adjust",
    ["custom:Security audit"],
    false,
    "codex",
    "codex-test",
    "high",
    "claude",
    "claude-test-model",
    "max",
    false,
    "sequential",
  ]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect(script.calls.find((call) => call.kind === "stages")?.initial).toEqual([
    "planning",
    "custom:Security audit",
  ]);
  expect(script.calls.find((call) => call.message === "Claude Code effort")?.initial).toBe("max");
  expect((await loadConfig(project.cwd)).config).toMatchObject(CUSTOM_CONFIG);
});

test("cancelling a custom step never saves a partial workflow", async ({ project }) => {
  const script = scriptedUi([[ADD_CUSTOM_STEP], new CancelError()]);
  await expect(
    initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Cancelled");
  expect((await loadConfig(project.cwd)).config).toBeUndefined();
});

test("cancelling while arranging a custom step never saves a partial workflow", async ({
  project,
}) => {
  const script = scriptedUi([[ADD_CUSTOM_STEP], "Audit", new CancelError()]);
  await expect(
    initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Cancelled");
  expect((await loadConfig(project.cwd)).config).toBeUndefined();
  await expect(readFile(join(project.cwd, "plan.md"))).rejects.toMatchObject({ code: "ENOENT" });
});
