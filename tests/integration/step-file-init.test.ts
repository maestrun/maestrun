import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { CancelError } from "../../src/shared/errors.js";
import { loadConfig } from "../../src/config/index.js";
import { workflowOrder } from "../../src/contracts/workflow.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { ADD_CUSTOM_STEP, CREATE_STEP_FILES } from "../../src/shared/ui.types.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const RESPONSES = [
  [ADD_CUSTOM_STEP],
  "Audit",
  workflowOrder(["planning", "custom:Audit"]),
  ["custom:Audit", ADD_CUSTOM_STEP],
  "Notes",
  workflowOrder(["planning", "custom:Audit", "custom:Notes"]),
  ["custom:Audit", "custom:Notes", CREATE_STEP_FILES],
  ["custom:Audit"],
  true,
  "codex",
  "codex-test",
  "high",
  false,
  "sequential",
] as const;
const AUDIT_PATH = ".maestrun/steps/audit.md";

test("creates requested templates, links selected steps and includes file paths in planning", async ({
  project,
}) => {
  await installExecutors(project);
  const script = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  expect(await readFile(join(project.cwd, AUDIT_PATH), "utf8")).toContain("# Audit\n");
  expect(await readFile(join(project.cwd, ".maestrun/steps/notes.md"), "utf8")).toContain(
    "# Notes\n",
  );
  expect((await loadConfig(project.cwd)).config?.stages).toEqual([
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    {
      id: "custom:Audit",
      executor: "codex",
      model: "codex-test",
      effort: "high",
      file: AUDIT_PATH,
    },
  ]);
  expect(script.messages.join("\n")).toContain(`Step file created: ${AUDIT_PATH}`);
  await createPlan({
    cwd: project.cwd,
    ui: scriptedUi(["paste", "New work", true]).ui,
    signal: new AbortController().signal,
  });
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toContain(AUDIT_PATH);
  expect(await readFile(project.log, "utf8")).toContain(AUDIT_PATH);
  expect(script.remaining()).toBe(0);
});

test("cancelling model selection leaves requested templates unwritten", async ({ project }) => {
  await installExecutors(project);
  const script = scriptedUi([...RESPONSES.slice(0, -2), new CancelError()]);
  await expect(
    initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Cancelled");
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
  expect((await loadConfig(project.cwd)).config).toBeUndefined();
});

test("reusing saved step files keeps the user's edited instructions", async ({ project }) => {
  await installExecutors(project);
  const first = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: first.ui, signal: new AbortController().signal });
  await writeFile(join(project.cwd, AUDIT_PATH), "# Audit\n\nUser's custom instructions.\n");
  const reused = scriptedUi(["reuse"]);
  await initialize({ cwd: project.cwd, ui: reused.ui, signal: new AbortController().signal });
  expect(await readFile(join(project.cwd, AUDIT_PATH), "utf8")).toContain(
    "User's custom instructions.",
  );
  expect((await loadConfig(project.cwd)).config?.stages[1]?.file).toBe(AUDIT_PATH);
  expect(reused.remaining()).toBe(0);
});

test("a generation failure keeps approved templates and their saved assignments", async ({
  project,
}) => {
  await installExecutors(project, "failure");
  const script = scriptedUi(RESPONSES);
  await initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  await expect(
    createPlan({
      cwd: project.cwd,
      ui: scriptedUi(["paste", "New work", true]).ui,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
  expect(await readFile(join(project.cwd, AUDIT_PATH), "utf8")).toContain("# Audit");
  expect((await loadConfig(project.cwd)).config?.stages[1]?.file).toBe(AUDIT_PATH);
});
