import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createPlan } from "../../src/modules/planning/index.js";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import { CONFIG, DRAFT } from "../helpers/context.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test("interrupting generation keeps the saved configuration and previous plan", async ({
  project,
}) => {
  await writeFile(join(project.cwd, "plan.md"), "previous plan");
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const script = scriptedUi([]);
  const controller = new AbortController();
  await expect(
    createPlan(
      { cwd: project.cwd, ui: script.ui, signal: controller.signal },
      {
        wizard: async () => DRAFT,
        detect: async ({ id }) => ({ id, state: "ready", detail: "Ready", nextAction: "" }),
        generate: async () => {
          controller.abort();
          return "### Task change: Change\n- Depends on: none\n\nImplement the change.";
        },
      },
    ),
  ).rejects.toThrow("Cancelled");
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
});

test("a plan edited during generation is preserved", async ({ project }) => {
  await writeFile(join(project.cwd, "plan.md"), "previous plan");
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const script = scriptedUi([]);
  await expect(
    createPlan(
      { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal },
      {
        wizard: async () => DRAFT,
        detect: async ({ id }) => ({ id, state: "ready", detail: "Ready", nextAction: "" }),
        generate: async () => {
          await writeFile(join(project.cwd, "plan.md"), "user edit");
          return "### Task change: Change\n- Depends on: none\n\nImplement the change.";
        },
      },
    ),
  ).rejects.toThrow("changed");
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("user edit");
});
