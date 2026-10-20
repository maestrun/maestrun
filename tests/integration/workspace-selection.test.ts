import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { configure, loadConfig } from "../../src/config/index.js";
import {
  checkWorkspaceRepositories,
  chooseWorkspaceRepositories,
  runWorkflow,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupWorkspace } from "../helpers/workspaces.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { scriptedUi } from "../helpers/ui.js";

test("repository selection persists and excludes unrelated repositories and context", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await configure(project.cwd, ["execution.repositories", "null"]);
  await mkdir(join(project.cwd, "unrelated/.git"), { recursive: true });
  await writeFile(join(project.cwd, "unrelated/.git/HEAD"), "invalid repository");
  await writeFile(join(project.cwd, "unrelated/data"), "unrelated data");
  const script = scriptedUi([["api"]]);
  await chooseWorkspaceRepositories({ ...runInput(project.cwd), ui: script.ui });
  expect(script.calls[0]?.initial).toEqual([]);
  expect((await loadConfig(project.cwd)).config?.execution?.repositories).toEqual(["api"]);
  await chooseWorkspaceRepositories({ ...runInput(project.cwd), ui: scriptedUi([]).ui });
  await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd, repositoryPaths }) => {
    expect(repositoryPaths).toEqual(["api"]);
    for (const name of ["apps", "unrelated"]) await expect(stat(join(cwd, name))).rejects.toThrow();
    await writeFile(join(cwd, "api/result"), "verified");
    return "Verified";
  });
  expect(await readFile(join(project.cwd, "api/result"), "utf8")).toBe("verified");
  expect(
    (await savedReport(project.cwd)).tasks[0]?.worktree?.repositories?.map((entry) => entry.path),
  ).toEqual(["api"]);
});

test("noninteractive parent workspaces require an explicit repository scope", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await configure(project.cwd, ["execution.repositories", "null"]);
  await expect(checkWorkspaceRepositories(project.cwd)).rejects.toThrow("Choose repositories");
  await expect(runWorkflow({ ...runInput(project.cwd), dryRun: true })).rejects.toThrow(
    "Choose repositories",
  );
});

test("cancelling repository selection keeps the configuration unchanged", async ({ project }) => {
  await setupWorkspace(project.cwd);
  await configure(project.cwd, ["execution.repositories", "null"]);
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await readFile(path, "utf8");
  await expect(
    chooseWorkspaceRepositories({ ...runInput(project.cwd), ui: scriptedUi([[]]).ui }),
  ).rejects.toThrow("Cancelled");
  expect(await readFile(path, "utf8")).toBe(before);
});

test.for([
  [],
  ["../outside"],
  ["/absolute"],
  ["api", "api"],
  ["apps", "apps/web"],
  ["api\\other"],
  ["."],
])("rejects invalid repository scope %j", async (selection, { project }) => {
  await setupWorkspace(project.cwd);
  await expect(
    configure(project.cwd, ["execution.repositories", JSON.stringify(selection)]),
  ).rejects.toThrow("execution.repositories");
  expect((await loadConfig(project.cwd)).config?.execution?.repositories).toEqual([
    "api",
    "apps/web",
  ]);
});

test("repository selections cannot become global defaults for unrelated projects", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await expect(
    configure(project.cwd, ["global", "execution.repositories", '["api"]']),
  ).rejects.toThrow("project-specific");
});
