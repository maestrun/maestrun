import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { saveConfig, loadConfig } from "../../src/config/index.js";
import {
  exportTemplate,
  importTemplate,
  initializeFromTemplate,
  parseTemplate,
  templateStepFiles,
} from "../../src/modules/workflow/index.js";
import { test } from "../helpers/project.js";
import { CONFIG } from "../helpers/context.js";
import { scriptedUi } from "../helpers/ui.js";

const config = {
  ...CONFIG,
  plugins: ["./audit.mjs"],
  stages: [
    ...CONFIG.stages,
    {
      id: "custom:Audit" as const,
      executor: "codex" as const,
      model: "test",
      file: ".maestrun/steps/audit.md",
    },
  ],
};
const instructions = "Review the tests.\n";
function input(cwd: string, responses: Parameters<typeof scriptedUi>[0]) {
  return { cwd, ui: scriptedUi(responses).ui, signal: new AbortController().signal };
}

async function source(cwd: string) {
  await saveConfig(cwd, config, { exists: false, content: "" });
  await mkdir(join(cwd, ".maestrun/steps"));
  await writeFile(join(cwd, ".maestrun/steps/audit.md"), instructions);
  await writeFile(join(cwd, "audit.mjs"), "throw new Error('must never execute');\n");
}

test("exports, imports and applies a portable workflow with instructions without executing plugins", async ({
  project,
}) => {
  await source(project.cwd);
  await exportTemplate(input(project.cwd, [true]), "bundle.json");
  const content = await readFile(join(project.cwd, "bundle.json"), "utf8");
  expect(content).not.toContain("must never execute");
  const bundle = parseTemplate(content);
  expect(bundle.files[".maestrun/steps/audit.md"]).toBe(instructions);
  expect(bundle.extensions[0]?.requirements.join(" ")).toContain("--trust-plugins");
  await importTemplate(input(project.cwd, [true]), "bundle.json", "portable");
  const destination = join(project.root, "other");
  await initializeFromTemplate(input(destination, ["portable", true]));
  expect(await readFile(join(destination, ".maestrun/steps/audit.md"), "utf8")).toBe(instructions);
  expect((await loadConfig(destination)).config).toEqual(config);
  await expect(readFile(join(destination, "audit.mjs"))).rejects.toThrow();
});

test("import rejects path traversal and unreferenced files", () => {
  for (const path of ["../escape", ".maestrun/config.json", ".maestrun/steps/extra.md"]) {
    expect(() =>
      parseTemplate(
        JSON.stringify({
          kind: "maestrun-template",
          version: 1,
          config,
          files: { [path]: "unsafe" },
        }),
      ),
    ).toThrow("Invalid template package");
  }
});

test("applying a template preserves conflicting instruction files and refuses linked directories", async ({
  project,
}) => {
  await source(project.cwd);
  const bundle = parseTemplate(
    JSON.stringify({
      kind: "maestrun-template",
      version: 1,
      config,
      files: { ".maestrun/steps/audit.md": "replacement" },
    }),
  );
  await expect(templateStepFiles(project.cwd, bundle)).rejects.toThrow("already exists");
  expect(await readFile(join(project.cwd, ".maestrun/steps/audit.md"), "utf8")).toBe(instructions);
  const other = join(project.root, "other");
  await mkdir(join(other, ".maestrun"), { recursive: true });
  await symlink(join(project.cwd, ".maestrun/steps"), join(other, ".maestrun/steps"));
  await expect(templateStepFiles(other, bundle)).rejects.toThrow("symlink");
});

test("legacy templates remain usable and missing files are explicit", async ({ project }) => {
  expect(parseTemplate(JSON.stringify(config)).missing).toContain(".maestrun/steps/audit.md");
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  await exportTemplate(input(project.cwd, [true]), "missing.json");
  const bundle = parseTemplate(await readFile(join(project.cwd, "missing.json"), "utf8"));
  expect(bundle.missing).toEqual([".maestrun/steps/audit.md", "./audit.mjs"]);
});
