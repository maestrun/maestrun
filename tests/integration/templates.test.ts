import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import { initializeFromTemplate, saveTemplate } from "../../src/modules/workflow/templates.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { maestrunHome } from "../../src/shared/home.js";
import { CONFIG } from "../helpers/context.js";
import { scriptedUi } from "../helpers/ui.js";
import { test } from "../helpers/project.js";
import type { Config } from "../../src/contracts/workflow.js";

const FULL_CONFIG: Config = {
  ...CONFIG,
  execution: { mode: "parallel", concurrency: 3, background: true },
  timeoutMs: 12000,
  targets: {
    frontend: { executor: "claude", model: "ui-model", effort: "high" },
    backend: { executor: "codex", model: "codex-test" },
  },
  plugins: ["./audit.mjs"],
};

function input(cwd: string, responses: Parameters<typeof scriptedUi>[0]) {
  const script = scriptedUi(responses);
  return { cwd, signal: new AbortController().signal, ui: script.ui, script };
}

function verifyPreview(context: ReturnType<typeof input>): void {
  context.ui = {
    ...context.ui,
    confirm: async (message, initial) => {
      const preview = context.script.messages.join("\n");
      for (const value of [
        "| Stage / target",
        "ui-model",
        "high",
        "parallel",
        "12000 ms",
        "./audit.mjs",
        "yes",
      ])
        expect(preview).toContain(value);
      expect(preview).not.toContain('"stages":');
      expect((await loadConfig(context.cwd)).config).toBeUndefined();
      return context.script.ui.confirm(message, initial);
    },
  };
}

test("saves a config template and previews all settings before initializing another project", async ({
  project,
}) => {
  const config = FULL_CONFIG;
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  await saveTemplate(input(project.cwd, [true]), "team");
  const template = join(maestrunHome(), "templates/team.json");
  expect(JSON.parse(await readFile(template, "utf8"))).toMatchObject({
    kind: "maestrun-template",
    config,
  });
  const destination = join(project.root, "other-project");
  const context = input(destination, ["team", true]);
  verifyPreview(context);
  await initializeFromTemplate(context);
  expect((await loadConfig(destination)).config).toEqual(config);
});

test("declining template save or initialization preserves existing files", async ({ project }) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  await saveTemplate(input(project.cwd, [true]), "team");
  const path = join(maestrunHome(), "templates/team.json");
  const before = await readFile(path, "utf8");
  await expect(saveTemplate(input(project.cwd, [false]), "team")).rejects.toThrow("Cancelled");
  expect(await readFile(path, "utf8")).toBe(before);
  const saved = await loadConfig(project.cwd);
  const replacement = { ...CONFIG, timeoutMs: 2000 };
  await saveConfig(project.cwd, replacement, saved.snapshot);
  const context = input(project.cwd, ["team", false]);
  await expect(initializeFromTemplate(context)).rejects.toThrow("Cancelled");
  expect(context.script.calls.at(-1)?.message).toContain("Replace the project workflow");
  expect((await loadConfig(project.cwd)).config).toEqual(replacement);
  const newProject = join(project.root, "new");
  await expect(initializeFromTemplate(input(newProject, ["team", false]))).rejects.toThrow(
    "Cancelled",
  );
  expect((await snapshotFile(join(newProject, ".maestrun/config.json"))).exists).toBe(false);
});

test.for(["../outside", "", "a/b", "bad name", "a".repeat(65)])(
  "rejects invalid template name %j",
  async (name, { project }) => {
    await expect(saveTemplate(input(project.cwd, []), name)).rejects.toThrow(
      "Invalid template name",
    );
  },
);

test("reports missing config, empty catalog and malformed templates", async ({ project }) => {
  await expect(saveTemplate(input(project.cwd, []), "team")).rejects.toThrow("No workflow");
  await expect(initializeFromTemplate(input(project.cwd, []))).rejects.toThrow(
    "No saved templates",
  );
  await writeFile(join(maestrunHome(), "templates/broken.json"), "not json");
  await expect(initializeFromTemplate(input(project.cwd, ["broken"]))).rejects.toThrow(
    "Template broken is invalid",
  );
});

test("aborting at confirmation does not save and concurrent changes are preserved", async ({
  project,
}) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const context = input(project.cwd, []);
  const controller = new AbortController();
  context.signal = controller.signal;
  context.ui = {
    ...context.ui,
    confirm: async () => {
      controller.abort();
      return true;
    },
  };
  await expect(saveTemplate(context, "team")).rejects.toThrow("Cancelled");
  const path = join(maestrunHome(), "templates/team.json");
  expect((await snapshotFile(path)).exists).toBe(false);
  const concurrent = input(project.cwd, []);
  concurrent.ui = {
    ...concurrent.ui,
    confirm: async () => {
      await writeFile(path, "other writer");
      return true;
    },
  };
  await expect(saveTemplate(concurrent, "team")).rejects.toThrow("changed during");
  expect(await readFile(path, "utf8")).toBe("other writer");
});

test("rejects a template-directory symlink", async ({ project }) => {
  await mkdir(maestrunHome(), { recursive: true });
  await symlink(project.bin, join(maestrunHome(), "templates"));
  await expect(initializeFromTemplate(input(project.cwd, []))).rejects.toThrow("regular directory");
});
