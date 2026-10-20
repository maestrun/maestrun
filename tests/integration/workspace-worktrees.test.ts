import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { gitOutput, runWorkflow, worktreePath } from "../../src/modules/execution/index.js";
import { diagnose } from "../../src/modules/onboarding/index.js";
import { test } from "../helpers/project.js";
import { setupWorkspace } from "../helpers/workspaces.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { READY } from "../helpers/context.js";

test("parallel tasks isolate and integrate two child repositories without a parent Git", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await runWorkflow({ ...runInput(project.cwd), dryRun: true });
  expect(
    (await diagnose(runInput(project.cwd), async () => READY)).some(
      (check) => check.status === "error",
    ),
  ).toBe(false);
  await runConcurrent(project.cwd);
  for (const path of ["api", "apps/web"])
    expect(await readFile(join(project.cwd, path, "b.txt"), "utf8")).toBe("b");
  await expect(stat(join(project.cwd, ".git"))).rejects.toThrow();
  expect((await savedReport(project.cwd)).tasks.every((task) => task.status === "completed")).toBe(
    true,
  );
});

test("cancelled child worktrees resume with their edits", async ({ project }) => {
  await setupWorkspace(project.cwd);
  const controller = new AbortController();
  await expect(
    runWorkflow(
      { ...runInput(project.cwd), only: ["a"], signal: controller.signal },
      async ({ cwd }) => {
        await writeFile(join(cwd, "api", "saved.txt"), "preserved");
        controller.abort();
        return "Interrupted";
      },
    ),
  ).rejects.toThrow("Cancelled");
  await runWorkflow({ ...runInput(project.cwd), only: ["a"] }, async ({ cwd }) => {
    expect(await readFile(join(cwd, "api", "saved.txt"), "utf8")).toBe("preserved");
    return "Recovered";
  });
  expect(await readFile(join(project.cwd, "api", "saved.txt"), "utf8")).toBe("preserved");
  expect((await savedReport(project.cwd)).tasks.find((task) => task.id === "c")?.status).toBe(
    "pending",
  );
});

test("child conflicts preserve all repositories and resume integration without rerunning models", async ({
  project,
}) => {
  await setupWorkspace(project.cwd);
  await expect(
    runWorkflow({ ...runInput(project.cwd), only: ["a", "c"] }, async ({ cwd, task }) => {
      await writeFile(join(cwd, "api", "base.txt"), `${task.id}\n`);
      await writeFile(join(cwd, "apps/web", `${task.id}.txt`), task.id);
      return "Verified";
    }),
  ).rejects.toThrow("Integration conflict");
  const report = await savedReport(project.cwd);
  const conflicting = report.tasks
    .find((task) => task.id === "c")
    ?.worktree?.repositories?.find((entry) => entry.path === "api");
  if (!conflicting) throw new Error("Missing conflict workspace");
  const path = worktreePath(join(project.cwd, "api"), conflicting.worktree);
  await writeFile(join(path, "base.txt"), "resolved\n");
  await gitOutput(path, ["add", "base.txt"]);
  await expect(stat(join(project.cwd, "apps/web/c.txt"))).rejects.toThrow();
  await runWorkflow({ ...runInput(project.cwd), only: ["c"] }, async () => {
    throw new Error("Must not rerun");
  });
  expect(await readFile(join(project.cwd, "api/base.txt"), "utf8")).toBe("resolved\n");
  expect(await readFile(join(project.cwd, "apps/web/c.txt"), "utf8")).toBe("c");
});

async function runConcurrent(project: string): Promise<void> {
  const paths = new Set<string>();
  let concurrent = 0;
  let maximum = 0;
  let release: () => void = () => {};
  const together = new Promise<void>((resolve) => {
    release = resolve;
  });
  await runWorkflow(runInput(project), async ({ cwd, task }) => {
    paths.add(cwd);
    maximum = Math.max(maximum, ++concurrent);
    if (concurrent === 2) release();
    await together;
    expect(cwd).not.toBe(project);
    for (const path of ["api", "apps/web"]) {
      expect(await gitOutput(join(cwd, path), ["rev-parse", "--show-toplevel"])).toBe(
        join(cwd, path),
      );
      await writeFile(join(cwd, path, `${task.id}.txt`), task.id);
    }
    concurrent--;
    return "Verified";
  });
  expect(maximum).toBe(2);
  expect(paths.size).toBe(3);
}
