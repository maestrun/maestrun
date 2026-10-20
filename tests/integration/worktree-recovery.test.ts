import { chmod, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { configure } from "../../src/config/index.js";
import { gitOutput, runWorkflow, worktreePath } from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { PARALLEL, runInput, savedReport } from "../helpers/worktrees.js";

test("cancellation retains isolated edits, including when resuming in sequential mode", async ({
  project,
}) => {
  await setupRun(project.cwd, PARALLEL);
  const controller = new AbortController();
  await expect(
    runWorkflow({ ...runInput(project.cwd), signal: controller.signal }, async ({ cwd, task }) => {
      await writeFile(join(cwd, `${task.id}.txt`), "retained\n");
      if (task.id === "a") controller.abort();
      return "Interrupted";
    }),
  ).rejects.toThrow("Cancelled");
  await expect(stat(join(project.cwd, "a.txt"))).rejects.toThrow();
  const state = (await savedReport(project.cwd)).tasks[0];
  if (!state?.worktree) throw new Error("Missing worktree");
  const retained = worktreePath(project.cwd, state.worktree);
  await configure(project.cwd, ["execution", "sequential"]);
  await runWorkflow(runInput(project.cwd), async ({ cwd, task }) => {
    if (task.id === "a") {
      expect(cwd).toBe(retained);
      expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("retained\n");
    }
    return "Recovered";
  });
  expect(await readFile(join(project.cwd, "a.txt"), "utf8")).toBe("retained\n");
});

test("integrates binary files, deletions, renames and executable modes", async ({ project }) => {
  await setupRun(project.cwd, PARALLEL);
  await runWorkflow(runInput(project.cwd), async ({ cwd, task, stage }) => {
    if (task.id !== "a" || stage.id !== "implementation") return "Verified";
    await writeFile(join(cwd, "binary.dat"), Buffer.from([0, 255, 1, 2]));
    await writeFile(join(cwd, "script.sh"), "#!/bin/sh\nexit 0\n");
    await chmod(join(cwd, "script.sh"), 0o755);
    await unlink(join(cwd, "application.ts"));
    await rename(join(cwd, "requirements.md"), join(cwd, "spec.md"));
    return "Verified";
  });
  expect(await readFile(join(project.cwd, "binary.dat"))).toEqual(Buffer.from([0, 255, 1, 2]));
  expect((await stat(join(project.cwd, "script.sh"))).mode & 0o111).toBe(0o111);
  await expect(stat(join(project.cwd, "application.ts"))).rejects.toThrow();
  await expect(stat(join(project.cwd, "requirements.md"))).rejects.toThrow();
  expect(await readFile(join(project.cwd, "spec.md"), "utf8")).toContain("acceptance criteria");
});

test("parallel preflight refuses missing Git history without running models", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await configure(project.cwd, ["execution", "parallel"]);
  const execute = vi.fn();
  await expect(runWorkflow(runInput(project.cwd), execute)).rejects.toThrow(
    "requires a Git repository",
  );
  await gitOutput(project.cwd, ["init", "--quiet"]);
  await expect(runWorkflow({ ...runInput(project.cwd), dryRun: true }, execute)).rejects.toThrow(
    "initial Git commit",
  );
  expect(execute).not.toHaveBeenCalled();
});

test("invalid saved worktree paths fail before running tasks", async ({ project }) => {
  await setupRun(project.cwd, PARALLEL);
  await runWorkflow(runInput(project.cwd), async () => "Verified");
  const report = await savedReport(project.cwd);
  const task = report.tasks[0];
  if (!task?.worktree) throw new Error("Missing worktree metadata");
  task.worktree.id = "../../outside";
  await writeFile(join(project.cwd, ".maestrun/run.json"), JSON.stringify(report));
  const execute = vi.fn();
  await expect(runWorkflow(runInput(project.cwd), execute)).rejects.toThrow(
    "invalid task worktree",
  );
  expect(execute).not.toHaveBeenCalled();
});
