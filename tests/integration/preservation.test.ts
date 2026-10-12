import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { createPlan } from "../../src/modules/planning/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { saveConfig, loadConfig } from "../../src/config/index.js";
import { CancelError } from "../../src/shared/errors.js";
import { CONFIG } from "../helpers/context.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test.for([false, new CancelError()])(
  "cancelling confirmation preserves an existing configuration and plan",
  async (response, { project }) => {
    await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
    await writeFile(join(project.cwd, "plan.md"), "previous plan");
    const before = await snapshotFile(join(project.cwd, ".maestrun", "config.json"));
    const script = scriptedUi(["paste", "New work", response]);
    await expect(
      createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
    ).rejects.toThrow("Cancelled");
    expect(await snapshotFile(join(project.cwd, ".maestrun", "config.json"))).toEqual(before);
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
  },
);

test("declining overwrite preserves both files and never launches planning", async ({
  project,
}) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  await writeFile(join(project.cwd, "plan.md"), "previous plan");
  const script = scriptedUi(["paste", "New work", true, false]);
  await expect(
    createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Cancelled");
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
  expect((await snapshotFile(project.log)).exists).toBe(false);
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
});

test.for(["failure", "unsupported", "empty"])(
  "generation %s preserves saved configuration and the previous plan",
  async (mode, { project }) => {
    await installExecutors(project, mode);
    await writeFile(join(project.cwd, "plan.md"), "previous plan");
    await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
    const script = scriptedUi(["paste", "New work", true, true]);
    await expect(
      createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
    ).rejects.toThrow();
    expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
  },
);

test("malformed configuration stops before prompting and leaves it intact", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun"));
  const path = join(project.cwd, ".maestrun", "config.json");
  await writeFile(path, "bad json");
  const script = scriptedUi([]);
  await expect(
    initialize({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("invalid");
  expect(script.calls).toHaveLength(0);
  expect(await readFile(path, "utf8")).toBe("bad json");
});

test("a saved workflow with a missing executor keeps its configuration", async ({ project }) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  vi.stubEnv("PATH", project.bin);
  const script = scriptedUi(["paste", "New work", true]);
  await expect(
    createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal }),
  ).rejects.toThrow("Not installed");
  expect((await loadConfig(project.cwd)).config).toEqual(CONFIG);
  expect((await snapshotFile(join(project.cwd, "plan.md"))).exists).toBe(false);
});
