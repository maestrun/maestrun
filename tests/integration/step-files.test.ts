import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { prepareStepFiles, saveStepFiles } from "../../src/modules/workflow/index.js";
import type { StepFile } from "../../src/contracts/workflow.js";
import { wizardContext } from "../helpers/context.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const SIGNAL = new AbortController().signal;
const AUDIT: StepFile = {
  id: "custom:Audit",
  path: ".maestrun/steps/audit.md",
  content: "# Audit\n",
};

test("prepares Unicode names and Markdown templates without writing files", async ({ project }) => {
  const context = wizardContext(project.cwd, scriptedUi([]).ui);
  const files = await prepareStepFiles(context, {
    order: ["planning", "custom:Revisão de código", "custom:🧪"],
  });
  expect(files.map((file) => file.path)).toEqual([
    ".maestrun/steps/revisao-de-codigo.md",
    ".maestrun/steps/step.md",
  ]);
  expect(files[0]?.content).toContain("# Revisão de código\n");
  for (const heading of ["Purpose", "Instructions", "Expected output", "Verification"])
    expect(files[0]?.content).toContain(`## ${heading}`);
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
});

test("writes all requested templates after confirmation", async ({ project }) => {
  const files = await prepareStepFiles(wizardContext(project.cwd, scriptedUi([]).ui), {
    order: ["planning", "custom:Audit", "custom:Notes"],
  });
  await saveStepFiles(project.cwd, files, SIGNAL);
  for (const file of files)
    expect(await readFile(join(project.cwd, file.path), "utf8")).toBe(file.content);
  expect(await readdir(join(project.cwd, ".maestrun/steps"))).toEqual(["audit.md", "notes.md"]);
});

test("existing files and colliding names get distinct new paths", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun/steps"), { recursive: true });
  const path = join(project.cwd, ".maestrun/steps/audit-notes.md");
  await writeFile(path, "User instructions");
  const files = await prepareStepFiles(wizardContext(project.cwd, scriptedUi([]).ui), {
    order: ["planning", "custom:Audit notes", "custom:Audit-notes"],
  });
  expect(files.map((file) => file.path)).toEqual([
    ".maestrun/steps/audit-notes-2.md",
    ".maestrun/steps/audit-notes-3.md",
  ]);
  await saveStepFiles(project.cwd, files, SIGNAL);
  expect(await readFile(path, "utf8")).toBe("User instructions");
});

test("preparing files again preserves the queued templates", async ({ project }) => {
  const context = wizardContext(project.cwd, scriptedUi([]).ui);
  const first = await prepareStepFiles(context, { order: ["planning", "custom:Audit"] });
  expect(
    await prepareStepFiles(context, { order: ["planning", "custom:Audit"], files: first }),
  ).toEqual(first);
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
});

test("existing linked files are preserved and missing ones can be restored", async ({
  project,
}) => {
  const linked: StepFile = { id: AUDIT.id, path: AUDIT.path };
  const context = wizardContext(project.cwd, scriptedUi([]).ui);
  const restored = await prepareStepFiles(context, {
    order: ["planning", linked.id],
    files: [linked],
  });
  expect(restored[0]?.path).toBe(linked.path);
  expect(restored[0]?.content).toContain("# Audit");
  await saveStepFiles(project.cwd, restored, SIGNAL);
  const existing = await prepareStepFiles(context, {
    order: ["planning", linked.id],
    files: [linked],
  });
  expect(existing).toEqual([linked]);
  await saveStepFiles(project.cwd, existing, SIGNAL);
  expect(await readFile(join(project.cwd, linked.path), "utf8")).toBe(restored[0]?.content);
});

test("a file appearing before saving is preserved", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun/steps"), { recursive: true });
  await writeFile(join(project.cwd, AUDIT.path), "Concurrent user edits");
  await expect(saveStepFiles(project.cwd, [AUDIT], SIGNAL)).rejects.toThrow("changed");
  expect(await readFile(join(project.cwd, AUDIT.path), "utf8")).toBe("Concurrent user edits");
});

test("cancellation creates no step files", async ({ project }) => {
  const controller = new AbortController();
  controller.abort();
  await expect(saveStepFiles(project.cwd, [AUDIT], controller.signal)).rejects.toThrow("Cancelled");
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
});

test.for([".maestrun", ".maestrun/steps"])(
  "rejects a symlinked directory: %s",
  async (directory, { project }) => {
    const link = join(project.cwd, directory);
    await mkdir(dirname(link), { recursive: true });
    await symlink(project.bin, link);
    await expect(
      prepareStepFiles(wizardContext(project.cwd, scriptedUi([]).ui), {
        order: ["planning", AUDIT.id],
      }),
    ).rejects.toThrow("symlink");
    await expect(saveStepFiles(project.cwd, [AUDIT], SIGNAL)).rejects.toThrow("symlink");
    expect(await readdir(project.bin)).toEqual([]);
  },
);

test.for(["../audit.md", ".maestrun/config.json", ".maestrun/steps/nested/audit.md"])(
  "rejects writes outside the step file directory: %s",
  async (path, { project }) => {
    await expect(saveStepFiles(project.cwd, [{ ...AUDIT, path }], SIGNAL)).rejects.toThrow(
      "invalid",
    );
    expect(await readdir(project.cwd)).not.toContain(".maestrun");
  },
);
