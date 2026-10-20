import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import {
  checkWorkspaceRepositories,
  discoverWorkspaceRepositories,
  gitOutput,
  runWorkflow,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupWorkspace } from "../helpers/workspaces.js";
import { runInput } from "../helpers/worktrees.js";

test.for([0o000, 0o111])(
  "parallel runs skip unreadable context directories with mode %s",
  async (mode, { project }) => {
    await setupWorkspace(project.cwd);
    const data = join(project.cwd, "mongodb/data/db/diagnostic.data");
    await mkdir(data, { recursive: true });
    await writeFile(join(data, "metrics"), "database data");
    await chmod(data, mode);
    try {
      expect(await discoverWorkspaceRepositories(project.cwd)).toEqual(["api", "apps/web"]);
      await runWorkflow({ ...runInput(project.cwd), dryRun: true });
      await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
        await expect(stat(join(cwd, "mongodb/data/db/diagnostic.data/metrics"))).rejects.toThrow();
        expect(await readFile(join(cwd, "requirements.md"), "utf8")).toContain("command");
        await writeFile(join(cwd, "api/result.txt"), "verified");
        return "Verified";
      });
      expect(await readFile(join(project.cwd, "api/result.txt"), "utf8")).toBe("verified");
      expect((await stat(data)).mode & 0o777).toBe(mode);
    } finally {
      await chmod(data, 0o755);
    }
  },
);

test("unreadable source context files do not block child worktrees", async ({ project }) => {
  await setupWorkspace(project.cwd);
  const file = join(project.cwd, "database.lock");
  await writeFile(file, "private database data");
  await chmod(file, 0o000);
  try {
    await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
      await expect(stat(join(cwd, "database.lock"))).rejects.toThrow();
      return "Verified";
    });
    expect((await stat(file)).mode & 0o777).toBe(0);
  } finally {
    await chmod(file, 0o644);
  }
});

test("unreadable files created by a task still block integration", async ({ project }) => {
  await setupWorkspace(project.cwd);
  let file = "";
  try {
    await expect(
      runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
        if (file) return "Verified";
        file = join(cwd, "private-result.txt");
        await writeFile(file, "must be retained");
        await chmod(file, 0o000);
        return "Verified";
      }),
    ).rejects.toThrow("step integration:");
  } finally {
    if (file) await chmod(file, 0o644);
  }
  expect(await readFile(file, "utf8")).toBe("must be retained");
});

test("an empty Git marker is ignored while valid repositories below it are discovered", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await mkdir(join(project.cwd, "apps/.git"));
  await mkdir(join(project.cwd, "uninitialized/.git"), { recursive: true });
  expect(await discoverWorkspaceRepositories(project.cwd)).toEqual(["api", "apps/web"]);
  await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async () => "Verified");
});

test("invalid discovered repositories remain errors and identify the affected child", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  const repository = join(project.cwd, "api");
  const head = await gitOutput(repository, ["rev-parse", "HEAD"]);
  await gitOutput(repository, [
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${head},dependency`,
  ]);
  await expect(checkWorkspaceRepositories(project.cwd, ["api"])).rejects.toThrow(
    "Repository api: Unresolved merges or submodules",
  );
});
