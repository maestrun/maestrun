import { readFile, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { expect, vi } from "vitest";
import { gitOutput, runWorkflow, worktreePath } from "../../src/modules/execution/index.js";
import { UserError } from "../../src/shared/errors.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { PARALLEL, runInput, savedReport } from "../helpers/worktrees.js";

test("isolates parallel files, merges before dependants and preserves HEAD and staging", async ({
  project,
}) => {
  await setupRun(project.cwd, PARALLEL);
  await writeFile(join(project.cwd, "application.ts"), "staged user edit\n");
  await gitOutput(project.cwd, ["add", "application.ts"]);
  await writeFile(join(project.cwd, "application.ts"), "unstaged user edit\n");
  const head = await gitOutput(project.cwd, ["rev-parse", "HEAD"]);
  const index = await gitOutput(project.cwd, ["diff", "--cached"]);
  const paths = new Set<string>();
  await runWorkflow(runInput(project.cwd), async ({ cwd, projectCwd, task, stage }) => {
    paths.add(cwd);
    expect(projectCwd).toBe(project.cwd);
    expect(cwd.startsWith(project.cwd + sep)).toBe(false);
    expect(await readFile(join(cwd, "application.ts"), "utf8")).toBe("unstaged user edit\n");
    if (task.id === "b") expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("a\n");
    if (task.id === "c") await expect(stat(join(cwd, "a.txt"))).rejects.toThrow();
    if (stage.id === "implementation") await writeFile(join(cwd, `${task.id}.txt`), `${task.id}\n`);
    return "Verified";
  });
  expect(paths.size).toBe(3);
  expect(await gitOutput(project.cwd, ["rev-parse", "HEAD"])).toBe(head);
  expect(await gitOutput(project.cwd, ["diff", "--cached"])).toBe(index);
  for (const id of ["a", "b", "c"])
    expect(await readFile(join(project.cwd, `${id}.txt`), "utf8")).toBe(`${id}\n`);
  for (const path of paths) await expect(stat(path)).rejects.toThrow();
  expect((await savedReport(project.cwd)).tasks.every((task) => task.worktree?.integrated)).toBe(
    true,
  );
});

test("nonoverlapping edits in the same file merge without overwriting each other", async ({
  project,
}) => {
  await setupRun(project.cwd, PARALLEL);
  const original = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n") + "\n";
  await writeFile(join(project.cwd, "shared.txt"), original);
  await runWorkflow(runInput(project.cwd), async ({ cwd, task, stage }) => {
    if (stage.id !== "implementation" || task.id === "b") return "Verified";
    const before = await readFile(join(cwd, "shared.txt"), "utf8");
    expect(before).toBe(original);
    await writeFile(
      join(cwd, "shared.txt"),
      before.replace(task.id === "a" ? "line 0\n" : "line 19\n", `${task.id}\n`),
    );
    return "Verified";
  });
  expect(await readFile(join(project.cwd, "shared.txt"), "utf8")).toBe(
    original.replace("line 0\n", "a\n").replace("line 19\n", "c\n"),
  );
});

test("conflicts retain the worktree and resume integration without repeating completed stages", async ({
  project,
}) => {
  await setupRun(project.cwd, PARALLEL);
  await writeFile(join(project.cwd, "shared.txt"), "original\n");
  await expect(
    runWorkflow(runInput(project.cwd), async ({ cwd, task, stage }) => {
      if (stage.id === "implementation" && task.id !== "b")
        await writeFile(join(cwd, "shared.txt"), `${task.id}\n`);
      return "Verified";
    }),
  ).rejects.toThrow("Integration conflict for task c");
  expect(await readFile(join(project.cwd, "shared.txt"), "utf8")).toBe("a\n");
  expect(await gitOutput(project.cwd, ["ls-files", "-u"])).toBe("");
  const state = (await savedReport(project.cwd)).tasks.find((task) => task.id === "c");
  if (!state?.worktree) throw new Error("Missing retained worktree");
  expect(state.status).toBe("failed");
  const path = worktreePath(project.cwd, state.worktree);
  expect(await readFile(join(path, "shared.txt"), "utf8")).toContain("<<<<<<<");
  await expect(runWorkflow(runInput(project.cwd), async () => "Unexpected")).rejects.toThrow(
    "still needs conflict resolution",
  );
  await writeFile(join(path, "shared.txt"), "a\nresolved c\n");
  await gitOutput(path, ["add", "shared.txt"]);
  const execute = vi.fn(async () => "Must not run");
  await runWorkflow(runInput(project.cwd), execute);
  expect(execute).not.toHaveBeenCalled();
  expect(await readFile(join(project.cwd, "shared.txt"), "utf8")).toBe("a\nresolved c\n");
  await expect(stat(path)).rejects.toThrow();
});

test("failed task edits stay isolated and unfinished steps resume in the same worktree", async ({
  project,
}) => {
  await setupRun(project.cwd, PARALLEL);
  let retained = "";
  await expect(
    runWorkflow(runInput(project.cwd), async ({ cwd, task, stage }) => {
      if (task.id === "a") {
        retained = cwd;
        if (stage.id === "testing") throw new UserError("Executor stopped", "Retry");
        await writeFile(join(cwd, "unfinished.txt"), "preserve\n");
      }
      return "Verified";
    }),
  ).rejects.toThrow("1/3 tasks completed");
  await expect(stat(join(project.cwd, "unfinished.txt"))).rejects.toThrow();
  const stages: string[] = [];
  await runWorkflow(runInput(project.cwd), async ({ cwd, task, stage }) => {
    if (task.id === "a") {
      expect(cwd).toBe(retained);
      stages.push(stage.id);
      expect(await readFile(join(cwd, "unfinished.txt"), "utf8")).toBe("preserve\n");
    }
    return "Fixed";
  });
  expect(stages).toEqual(["testing"]);
  expect(await readFile(join(project.cwd, "unfinished.txt"), "utf8")).toBe("preserve\n");
});
