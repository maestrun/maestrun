import os from "node:os";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { configure, loadConfig, saveConfig } from "../../src/config/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { CONFIG } from "../helpers/context.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test("global defaults merge per execution field and project edits remain local", async ({
  project,
}) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await configure(project.cwd, ["global", "execution", '{"mode":"parallel","concurrency":5}']);
  await configure(project.cwd, ["global", "background", "true"]);
  const globalPath = join(os.homedir(), ".maestrun/config.json");
  const globalBefore = await readFile(globalPath, "utf8");
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  expect((await loadConfig(project.cwd)).config?.execution).toEqual({
    mode: "parallel",
    concurrency: 5,
    background: true,
  });
  await configure(project.cwd, ["background", "false"]);
  expect((await loadConfig(project.cwd)).config?.execution).toEqual({
    mode: "parallel",
    concurrency: 5,
    background: false,
  });
  expect(await readFile(globalPath, "utf8")).toBe(globalBefore);
  expect(JSON.parse(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8"))).toEqual({
    ...CONFIG,
    execution: { background: false },
  });
  await configure(project.cwd, ["global", "concurrency", "7"]);
  expect((await loadConfig(project.cwd)).config?.execution?.concurrency).toBe(7);
  await configure(project.cwd, ["background", "null"]);
  expect((await loadConfig(project.cwd)).config?.execution?.background).toBe(true);
});

test("global stage edits seed only stages from the current project", async ({ project }) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await saveConfig(
    project.cwd,
    { ...CONFIG, plugins: ["./private.mjs"] },
    { exists: false, content: "" },
  );
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await readFile(path, "utf8");
  await configure(project.cwd, ["global", "stages", "planning", "model", "global-model"]);
  expect(await readFile(path, "utf8")).toBe(before);
  const global = JSON.parse(await readFile(join(os.homedir(), ".maestrun/config.json"), "utf8"));
  expect(global).toEqual({ ...CONFIG, stages: [{ ...CONFIG.stages[0], model: "global-model" }] });
  expect((await loadConfig(project.cwd)).config?.stages[0]?.model).toBe("codex-test");
  const other = join(project.root, "other");
  await mkdir(other);
  expect((await loadConfig(other)).config?.stages[0]?.model).toBe("global-model");
  await configure(other, ["stages.planning.effort", "high"]);
  expect((await loadConfig(other)).config?.stages[0]?.effort).toBe("high");
  expect(JSON.parse(await readFile(join(os.homedir(), ".maestrun/config.json"), "utf8"))).toEqual(
    global,
  );
});

test("first initialization uses global options without requiring global stages", async ({
  project,
}) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await configure(project.cwd, ["global", "background", "true"]);
  await configure(project.cwd, ["global", "execution", "parallel"]);
  await configure(project.cwd, ["global", "timeoutMs", "12000"]);
  await installExecutors(project);
  const script = scriptedUi([[], "codex", "codex-test", "", false, "parallel"]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect(script.calls.find((call) => call.message === "Task execution")?.initial).toBe("parallel");
  expect((await loadConfig(project.cwd)).config).toMatchObject({
    timeoutMs: 12000,
    execution: { mode: "parallel", concurrency: 2, background: true },
  });
});

test("malformed global files are preserved and reported with their path", async ({ project }) => {
  const directory = join(os.homedir(), ".maestrun");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "config.json");
  await writeFile(path, "broken");
  await expect(configure(project.cwd, ["global", "background", "true"])).rejects.toThrow(path);
  expect(await readFile(path, "utf8")).toBe("broken");
});

test("global file symlinks are rejected before writes", async ({ project }) => {
  const directory = join(os.homedir(), ".maestrun");
  await mkdir(directory, { recursive: true });
  const target = join(project.cwd, "application.ts");
  const before = await readFile(target, "utf8");
  await symlink(target, join(directory, "config.json"));
  await expect(configure(project.cwd, ["global", "background", "true"])).rejects.toThrow(
    "regular file",
  );
  expect(await readFile(target, "utf8")).toBe(before);
});
