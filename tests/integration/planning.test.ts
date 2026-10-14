import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { loadConfig } from "../../src/config/index.js";
import type { ExecutorId } from "../../src/contracts/workflow.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const PROJECT_FILES = [".gitignore", ".maestrun", "application.ts", "plan.md", "requirements.md"];

async function expectSelectedEffort(log: string, executor: ExecutorId): Promise<void> {
  const records = (await readFile(log, "utf8")).split("\n").filter(Boolean);
  expect(records).toHaveLength(1);
  const record: unknown = JSON.parse(records[0] ?? "");
  expect(record).toMatchObject({
    executor,
    args: expect.arrayContaining(
      executor === "codex" ? ['model_reasoning_effort="high"'] : ["--effort", "high"],
    ),
  });
}

test.for(["codex", "claude"] as const)(
  "generates a complete plan using %s without changing application files",
  async (executor, { project }) => {
    await installExecutors(project);
    const model = executor === "codex" ? "codex-test" : "claude-test-model";
    const setup = scriptedUi([[], executor, model, "high", false, "sequential"]);
    await initialize({ cwd: project.cwd, ui: setup.ui, signal: new AbortController().signal });
    const script = scriptedUi(["file", join(project.cwd, "requirements.md"), true]);
    await createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
    expect(script.remaining()).toBe(0);
    expect((await loadConfig(project.cwd)).config?.stages).toEqual([
      { id: "planning", executor, model, effort: "high" },
    ]);
    const plan = await readFile(join(project.cwd, "plan.md"), "utf8");
    expect(plan).toContain(
      `| Planning | ${executor === "codex" ? "Codex" : "Claude Code"} | ${model} | high |`,
    );
    expect(plan).toContain("## Tasks");
    expect(plan).toContain("Acceptance:");
    expect(plan).toContain("## Verification");
    expect(await readFile(join(project.cwd, "application.ts"), "utf8")).toBe(
      "export const original = true;\n",
    );
    expect(await readdir(project.cwd)).toEqual(PROJECT_FILES);
    await expectSelectedEffort(project.log, executor);
  },
);

test("saves future stage assignments but invokes only the planning executor", async ({
  project,
}) => {
  await installExecutors(project);
  const script = scriptedUi([
    ["testing", "implementation"],
    true,
    "codex",
    "codex-test",
    "",
    false,
    "sequential",
  ]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  await createPlan({
    cwd: project.cwd,
    ui: scriptedUi(["path", "requirements.md", true]).ui,
    signal: new AbortController().signal,
  });
  const config = (await loadConfig(project.cwd)).config;
  const ids = config?.stages.map((stage) => stage.id);
  expect(ids).toEqual(["planning", "implementation", "testing"]);
  expect(
    config?.stages.every((stage) => stage.executor === "codex" && stage.model === "codex-test"),
  ).toBe(true);
  const records = (await readFile(project.log, "utf8")).split("\n").filter(Boolean);
  expect(records).toHaveLength(1);
  expect(records[0]).toContain("planning only");
});

test("reuses saved assignments without repeating stage and model questions", async ({
  project,
}) => {
  await installExecutors(project);
  const first = scriptedUi([[], "codex", "codex-test", "high", false, "sequential"]);
  await initialize({ cwd: project.cwd, ui: first.ui, signal: new AbortController().signal });
  await createPlan({
    cwd: project.cwd,
    ui: scriptedUi(["path", "requirements.md", true]).ui,
    signal: new AbortController().signal,
  });
  const second = scriptedUi(["paste", "Different requested work", true, true]);
  await createPlan({ cwd: project.cwd, ui: second.ui, signal: new AbortController().signal });
  expect(
    second.calls.some(
      (call) => call.kind === "stages" || call.kind === "search" || call.message === "Executor",
    ),
  ).toBe(false);
  expect(second.messages.join("\n")).toContain("may consume your available usage");
  expect((await loadConfig(project.cwd)).config?.stages[0]?.model).toBe("codex-test");
  expect((await loadConfig(project.cwd)).config?.stages[0]?.effort).toBe("high");
  const records = (await readFile(project.log, "utf8")).split("\n").filter(Boolean);
  const reused: unknown = JSON.parse(records[1] ?? "");
  expect(reused).toMatchObject({ args: expect.arrayContaining(['model_reasoning_effort="high"']) });
  expect(second.remaining()).toBe(0);
});
