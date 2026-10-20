import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { gitOutput, runWorkflow, worktreePath } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupWorkspace } from "../helpers/workspaces.js";
import { runInput, savedReport } from "../helpers/worktrees.js";

test("child snapshots include dirty files while preserving the original HEAD and staging index", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  const repo = join(project.cwd, "api");
  await writeFile(join(repo, "base.txt"), "staged\n");
  await gitOutput(repo, ["add", "base.txt"]);
  await writeFile(join(repo, "base.txt"), "unstaged\n");
  const head = await gitOutput(repo, ["rev-parse", "HEAD"]);
  const index = await gitOutput(repo, ["write-tree"]);
  await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
    expect(await readFile(join(cwd, "api/base.txt"), "utf8")).toBe("unstaged\n");
    await writeFile(join(cwd, "api/new.txt"), "task result");
    return "Verified";
  });
  expect(await gitOutput(repo, ["rev-parse", "HEAD"])).toBe(head);
  expect(await gitOutput(repo, ["write-tree"])).toBe(index);
  expect(await readFile(join(repo, "new.txt"), "utf8")).toBe("task result");
});

test("changes outside repositories are retained and never silently discarded", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await expect(
    runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
      await writeFile(join(cwd, "requirements.md"), "outside change");
      return "Verified";
    }),
  ).rejects.toThrow("outside the Git repositories");
  const state = (await savedReport(project.cwd)).tasks[0];
  if (!state?.worktree) throw new Error("Missing workspace");
  expect(
    await readFile(join(worktreePath(project.cwd, state.worktree), "requirements.md"), "utf8"),
  ).toBe("outside change");
  expect(await readFile(join(project.cwd, "requirements.md"), "utf8")).not.toBe("outside change");
});

test("moving a repository after interruption blocks recovery before models run", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  const controller = new AbortController();
  await expect(
    runWorkflow({ ...runInput(project.cwd), only: ["a"], signal: controller.signal }, async () => {
      controller.abort();
      return "Interrupted";
    }),
  ).rejects.toThrow("Cancelled");
  await rename(join(project.cwd, "api"), join(project.cwd, "backend"));
  const execute = vi.fn();
  await expect(runWorkflow({ ...runInput(project.cwd), only: ["a"] }, execute)).rejects.toThrow(
    "Repository api is missing",
  );
  expect(execute).not.toHaveBeenCalled();
});
