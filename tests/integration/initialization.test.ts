import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test("init saves workflow settings without asking for planning inputs", async ({ project }) => {
  await installExecutors(project);
  const script = scriptedUi([[], "codex", "codex-test", "high", false, "sequential"]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config?.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
  ]);
  expect((await snapshotFile(join(project.cwd, "plan.md"))).exists).toBe(false);
  expect((await snapshotFile(project.log)).exists).toBe(false);
  expect(script.calls.some((call) => call.kind === "paste" || call.kind === "checkbox")).toBe(
    false,
  );
  expect(script.messages.at(-1)).toBe("Run maestrun plan to create the plan.");
  expect(script.remaining()).toBe(0);
});

test("init preserves an existing plan", async ({ project }) => {
  await installExecutors(project);
  await writeFile(join(project.cwd, "plan.md"), "User's previous plan");
  const script = scriptedUi([[], "codex", "codex-test", "", false, "sequential"]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("User's previous plan");
  expect((await snapshotFile(project.log)).exists).toBe(false);
});

test("init does not inspect the plan output path", async ({ project }) => {
  await installExecutors(project);
  await mkdir(join(project.cwd, "plan.md"));
  const script = scriptedUi([[], "codex", "codex-test", "", false, "sequential"]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config?.stages[0]?.model).toBe("codex-test");
});

test("plan requires a saved workflow before asking any questions", async ({ project }) => {
  const script = scriptedUi([]);
  await expect(
    createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("No saved workflow");
  expect(script.calls).toHaveLength(0);
});
