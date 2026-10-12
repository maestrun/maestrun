import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { snapshotFile } from "../../src/shared/atomic.js";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import type { Config } from "../../src/contracts/workflow.js";
import { CancelError } from "../../src/shared/errors.js";
import { createPlan, planningPrompt, renderPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { CONFIG } from "../helpers/context.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const ADVANCED: Config = {
  ...CONFIG,
  targets: {
    frontend: { executor: "claude", model: "claude-test-model", effort: "max" },
    backend: { executor: "codex", model: "codex-other", effort: "ultra" },
  },
};
const RESPONSES = [
  [],
  "codex",
  "codex-test",
  "",
  true,
  "claude",
  "claude-test-model",
  "max",
  "codex",
  "codex-other",
  "ultra",
  "sequential",
] as const;
const FRONTEND_ROW = "| frontend | Claude Code | claude-test-model | max |";
const BACKEND_ROW = "| backend | Codex | codex-other | ultra |";

async function expectPlanningRequest(log: string): Promise<void> {
  const records = (await readFile(log, "utf8")).trim().split("\n");
  expect(records).toHaveLength(1);
  const record: unknown = JSON.parse(records[0] ?? "");
  expect(record).toMatchObject({
    executor: "codex",
    args: expect.arrayContaining(["--model", "codex-test"]),
    input: expect.stringContaining(FRONTEND_ROW),
  });
  expect(record).toMatchObject({ input: expect.stringContaining(BACKEND_ROW) });
}

test("init saves advanced assignments and planning carries them without executing implementation", async ({
  project,
}) => {
  await installExecutors(project);
  const setup = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: setup.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config).toMatchObject(ADVANCED);
  expect((await snapshotFile(project.log)).exists).toBe(false);
  const script = scriptedUi(["paste", "Build frontend and backend", true]);
  await createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  await expectPlanningRequest(project.log);
  const plan = await readFile(join(project.cwd, "plan.md"), "utf8");
  expect(plan).toContain(FRONTEND_ROW);
  expect(plan).toContain(BACKEND_ROW);
  expect(script.messages.join("\n")).toContain(
    "frontend implementation: Claude Code / claude-test-model / effort: max",
  );
  expect(script.messages.join("\n")).toContain(
    "backend implementation: Codex / codex-other / effort: ultra",
  );
  expect(await readFile(join(project.cwd, "application.ts"), "utf8")).toBe(
    "export const original = true;\n",
  );
  expect(setup.remaining()).toBe(0);
});

test("saved advanced workflows can be kept without repeating setup prompts", async ({
  project,
}) => {
  await saveConfig(project.cwd, ADVANCED, { exists: false, content: "" });
  const script = scriptedUi(["reuse"]);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect((await loadConfig(project.cwd)).config).toMatchObject(ADVANCED);
  expect(script.calls).toHaveLength(1);
});

test("cancellation during backend setup preserves saved config and user project files", async ({
  project,
}) => {
  await installExecutors(project);
  await saveConfig(project.cwd, ADVANCED, { exists: false, content: "" });
  await writeFile(join(project.cwd, "plan.md"), "User plan");
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await snapshotFile(path);
  const script = scriptedUi(["adjust", ...RESPONSES.slice(0, -2), new CancelError()]);
  await expect(
    initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Cancelled");
  expect(await snapshotFile(path)).toEqual(before);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("User plan");
  expect((await snapshotFile(project.log)).exists).toBe(false);
});

test("planning specifies implementation overrides, mixed-task splitting and stage fallbacks", () => {
  const prompt = planningPrompt({
    config: ADVANCED,
    requirements: { text: "New app", source: "Paste" },
  });
  expect(prompt).toContain("instead of the implementation stage assignment");
  expect(prompt).toContain("Split tasks spanning both targets");
  expect(prompt).toContain(
    "Planning, Tests, QA, Review and custom stages keep their stage assignments",
  );
  expect(renderPlan(CONFIG, "## Tasks\nA task")).not.toContain(
    "Advanced implementation assignments",
  );
});
