import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import { initializeProject } from "../../src/modules/onboarding/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { BackError, CancelError } from "../../src/shared/errors.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
import { RUN_CONFIG } from "../helpers/run.js";

const PLAN =
  "## Tasks\n\n### Task greeting: Create a greeting\n\n- Depends on: none\n- Steps: implementation, testing\n\nImplement and test a greeting.\n";

function input(cwd: string, answers: Parameters<typeof scriptedUi>[0]) {
  const script = scriptedUi(["codex", "codex-test", "orchestrator", ...answers]);
  return { cwd, quick: true, signal: new AbortController().signal, ui: script.ui, script };
}

test.for(["sequential", "parallel"])(
  "orchestrator init reuses a plan with %s scheduling and no coordination question",
  async (mode, { project }) => {
    await installExecutors(project);
    await writeFile(join(project.cwd, "plan.md"), PLAN);
    const context = input(project.cwd, [mode, true, true]);
    await initializeProject(context);
    expect((await loadConfig(project.cwd)).config?.execution).toMatchObject({
      orchestrator: "agent",
      mode,
      concurrency: 2,
    });
    expect((await loadConfig(project.cwd)).config?.stages.map((stage) => stage.id)).toEqual([
      "planning",
    ]);
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe(PLAN);
    expect((await snapshotFile(project.log)).exists).toBe(false);
    expect(context.script.calls.map((call) => call.message)).toEqual([
      "Executor",
      "Codex model (type to search)",
      "Workflow",
      "Managed task execution",
      "Save this workflow?",
      "Use the existing plan.md?",
    ]);
    expect(context.script.remaining()).toBe(0);
  },
);

test.for([false, true])(
  "orchestrator generates from prompt.md, replacing=%s",
  async (replace, { project }) => {
    await installExecutors(project);
    await writeFile(join(project.cwd, "prompt.md"), "Build the requested greeting.");
    if (replace) await writeFile(join(project.cwd, "plan.md"), PLAN);
    const context = input(project.cwd, [
      "sequential",
      true,
      ...(replace ? [false] : []),
      "prompt.md",
    ]);
    await initializeProject(context);
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toContain("## Verification");
    const records = (await readFile(project.log, "utf8")).trim().split("\n");
    expect(records).toHaveLength(1);
    expect(records[0]).toContain("Build the requested greeting.");
    expect(context.script.calls.filter((call) => call.kind === "input")).toEqual([
      expect.objectContaining({ initial: "prompt.md" }),
    ]);
    expect(context.script.remaining()).toBe(0);
    expect(context.script.messages.join("\n")).toContain("Final plan review — task steps");
    expect(context.script.messages.join("\n")).toContain("Write report — Codex / codex-test");
    expect(context.script.messages.at(-1)).toContain("maestrun run --dry-run");
  },
);

test("invalid prompt paths retry and accept another requirements file", async ({ project }) => {
  await installExecutors(project);
  const context = input(project.cwd, ["sequential", true, "missing.md", "requirements.md"]);
  await initializeProject(context);
  expect(context.script.messages.join("\n")).toContain("Could not open missing.md");
  expect((await snapshotFile(join(project.cwd, "plan.md"))).exists).toBe(true);
  expect(context.script.remaining()).toBe(0);
});

test.for([new BackError(), new CancelError()])(
  "cancellation preserves the previous plan: %s",
  async (error, { project }) => {
    await installExecutors(project);
    await writeFile(join(project.cwd, "plan.md"), PLAN);
    const context = input(project.cwd, ["sequential", true, false, error]);
    await expect(initializeProject(context)).rejects.toThrow("Cancelled");
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe(PLAN);
    expect((await snapshotFile(project.log)).exists).toBe(false);
  },
);

test("generation failure preserves the previous plan", async ({ project }) => {
  await installExecutors(project, "failure");
  await writeFile(join(project.cwd, "plan.md"), PLAN);
  const context = input(project.cwd, ["sequential", true, false, "requirements.md"]);
  await expect(initializeProject(context)).rejects.toThrow();
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe(PLAN);
});

test("invalid existing plans fail reuse without a model call", async ({ project }) => {
  await installExecutors(project);
  await writeFile(join(project.cwd, "plan.md"), "Not a task plan");
  const context = input(project.cwd, ["sequential", true, true]);
  await expect(initializeProject(context)).rejects.toThrow();
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("Not a task plan");
  expect((await snapshotFile(project.log)).exists).toBe(false);
});

test("existing workflows offer orchestration and retain stages, models and other settings", async ({
  project,
}) => {
  const config = {
    ...RUN_CONFIG,
    timeoutMs: 9000,
    execution: { mode: "sequential" as const, concurrency: 4 },
  };
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  await writeFile(join(project.cwd, "plan.md"), PLAN);
  const script = scriptedUi(["orchestrator", "parallel", true, true]);
  await initializeProject({
    cwd: project.cwd,
    quick: true,
    ui: script.ui,
    signal: new AbortController().signal,
  });
  expect((await loadConfig(project.cwd)).config).toEqual({
    ...config,
    execution: { mode: "parallel", concurrency: 4, orchestrator: "agent" },
  });
  expect(script.remaining()).toBe(0);
  expect(script.calls[0]?.message).toBe("Saved workflow found");
});
