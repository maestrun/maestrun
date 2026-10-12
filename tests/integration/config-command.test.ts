import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { configure, loadConfig, saveConfig } from "../../src/config/index.js";
import { CONFIG } from "../helpers/context.js";
import { test } from "../helpers/project.js";

const ASSIGNMENT = { executor: "codex", model: "codex-test" } as const;

async function cli(cwd: string, args: string[]): Promise<void> {
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "log").mockImplementation(() => {});
  await createApp()
    .exitOverride()
    .parseAsync(["config", ...args], { from: "user" });
}

test("config CLI edits project execution settings without a terminal", async ({ project }) => {
  await saveConfig(
    project.cwd,
    { ...CONFIG, timeoutMs: 12000, plugins: ["./keep.mjs"] },
    { exists: false, content: "" },
  );
  await cli(project.cwd, ["background", "true"]);
  await cli(project.cwd, ["execution", "parallel"]);
  await cli(project.cwd, ["execution.concurrency", "4"]);
  expect((await loadConfig(project.cwd)).config).toEqual({
    ...CONFIG,
    timeoutMs: 12000,
    plugins: ["./keep.mjs"],
    execution: { mode: "parallel", concurrency: 4, background: true },
  });
  await cli(project.cwd, ["execution", "sequential"]);
  await cli(project.cwd, ["background", "false"]);
  expect((await loadConfig(project.cwd)).config?.execution).toEqual({
    mode: "sequential",
    concurrency: 4,
    background: false,
  });
  await cli(project.cwd, []);
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"background": false'));
});

test("edits stage IDs or indexes, target assignments and optional fields", async ({ project }) => {
  await saveConfig(
    project.cwd,
    {
      ...CONFIG,
      stages: [...CONFIG.stages, { id: "custom:Audit.v2", executor: "codex", model: "audit" }],
      targets: { frontend: ASSIGNMENT, backend: ASSIGNMENT },
    },
    { exists: false, content: "" },
  );
  for (const args of [
    ["stages", "planning", "executor", "claude"],
    ["stage.planning.model", "claude-test"],
    ["stages.0.effort", "high"],
    ["stages", "custom:Audit.v2", "file", ".maestrun/steps/audit.md"],
    ["targets.frontend.model", "frontend-model"],
    ["timeoutMs", "15000"],
  ])
    await cli(project.cwd, args);
  expect((await loadConfig(project.cwd)).config).toMatchObject({
    stages: [
      { id: "planning", executor: "claude", model: "claude-test", effort: "high" },
      { id: "custom:Audit.v2", file: ".maestrun/steps/audit.md" },
    ],
    targets: { frontend: { model: "frontend-model" }, backend: { model: "codex-test" } },
    timeoutMs: 15000,
  });
  await cli(project.cwd, ["stages.planning.effort", "null"]);
  expect((await loadConfig(project.cwd)).config?.stages[0]).not.toHaveProperty("effort");
});

test.for([
  ["background", "yes"],
  ["execution", "invalid"],
  ["concurrency", "17"],
  ["execution.concurrency", "1.5"],
  ["timeoutMs", "12"],
  ["plugins", '["/bad.mjs"]'],
  ["stages.planning.executor", "unknown"],
  ["stages.planning.model", "with spaces"],
  ["stages.planning.effort", "huge"],
  ["stages.missing.model", "test"],
  ["stages.99.model", "test"],
  ["stages.planning.model", "null"],
  ["stages.planning.file", ".maestrun/steps/audit.md"],
  ["execution", '{"mode":"parallel","typo":true}'],
  ["typo", "true"],
  ["__proto__.polluted", "true"],
  ["background"],
])("rejects invalid edits without modifying the project: %j", async (args, { project }) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await readFile(path, "utf8");
  await expect(configure(project.cwd, args)).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(before);
});

test("accepts JSON replacements for stages and targets", async ({ project }) => {
  await cli(project.cwd, ["stages", JSON.stringify(CONFIG.stages)]);
  const assignment = { executor: "claude", model: "claude-test", effort: "high" };
  await cli(project.cwd, [
    "targets",
    JSON.stringify({ frontend: assignment, backend: assignment }),
  ]);
  expect((await loadConfig(project.cwd)).config?.targets?.backend).toEqual(assignment);
  await cli(project.cwd, ["targets", "null"]);
  expect((await loadConfig(project.cwd)).config?.targets).toBeUndefined();
});

test("requires a workflow for project edits but global options work before init", async ({
  project,
}) => {
  await expect(cli(project.cwd, ["background", "true"])).rejects.toThrow("No workflow");
  await expect(readFile(join(project.cwd, ".maestrun/config.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await cli(project.cwd, ["global", "background", "true"]);
  await cli(project.cwd, ["global"]);
  expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('"background": true'));
});
