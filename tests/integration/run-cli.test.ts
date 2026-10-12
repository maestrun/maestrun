import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { runCommand } from "../../src/shared/process.js";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";

const CLI = fileURLToPath(new URL("../../src/main.ts", import.meta.url));
const TSX = import.meta.resolve("tsx");

async function cli(cwd: string, args: readonly string[]): ReturnType<typeof runCommand> {
  return runCommand({
    executable: process.execPath,
    args: ["--import", TSX, CLI, ...args],
    cwd,
    timeoutMs: 10000,
  });
}

test("headless CLI dry-run, execution and status work from a host's terminal tool", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project);
  const preview = await cli(project.cwd, ["run", "--tasks", "tasks.json", "--dry-run"]);
  expect(preview.code).toBe(0);
  expect(preview.stdout).toContain("implementation: codex/code-test");
  const run = await cli(project.cwd, ["run", "--tasks", "tasks.json"]);
  expect(run.code).toBe(0);
  expect(run.stdout).toContain("Completed 3/3 tasks");
  expect((await cli(project.cwd, ["run", "--tasks", "tasks.json"])).code).toBe(0);
  expect((await readFile(project.log, "utf8")).trim().split("\n")).toHaveLength(6);
  const status = await cli(project.cwd, ["run", "--status"]);
  expect(status.code).toBe(0);
  expect(JSON.parse(status.stdout)).toMatchObject({
    tasks: [
      { id: "a", status: "completed" },
      { id: "b", status: "completed" },
      { id: "c", status: "completed" },
    ],
  });
});

test("headless failures return exit code 1 with task errors in the saved report", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "failed");
  const result = await cli(project.cwd, ["run", "--tasks", "tasks.json"]);
  expect(result.code).toBe(1);
  expect(result.stdout).toContain("A test failed");
  expect(result.stderr).toContain("0/3 tasks completed");
});

async function editableTasks(cwd: string, layout: string, title: string): Promise<void> {
  const markdown = `### Task editable: ${title}\n\n- Depends on: none\n\nImplement A`;
  await writeFile(join(cwd, layout === "files" ? "editable.md" : "tasks.md"), markdown);
  if (layout === "files")
    await writeFile(join(cwd, "tasks.md"), "- [ ] [Editable task](editable.md)");
}

test.for(["single", "files"])(
  "CLI lists and executes the user's latest Markdown edits (%s)",
  async (layout, { project }) => {
    await setupRun(project.cwd);
    await executionProcesses(project);
    await writeFile(join(project.cwd, "plan.md"), "[tasks.md](tasks.md)");
    await editableTasks(project.cwd, layout, "Original title");
    expect((await cli(project.cwd, ["run", "--dry-run"])).stdout).toContain("Original title");
    await editableTasks(project.cwd, layout, "Updated title");
    const preview = await cli(project.cwd, ["run", "--tasks", "tasks.md", "--dry-run"]);
    expect(preview.code).toBe(0);
    expect(preview.stdout).toContain("Updated title");
    const run = await cli(project.cwd, ["run"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Completed 1/1 tasks");
    const report = JSON.parse(await readFile(join(project.cwd, ".maestrun/run.json"), "utf8")) as {
      tasks: unknown[];
    };
    expect(report.tasks).toMatchObject([
      { id: "editable", title: "Updated title", status: "completed" },
    ]);
  },
);

test("status before a run gives a next action and plugin export works without a terminal", async ({
  project,
}) => {
  expect((await cli(project.cwd, ["run", "--status"])).stderr).toContain("Run maestrun run first");
  const path = join(project.cwd, "bundle");
  expect((await cli(project.cwd, ["plugin", path])).code).toBe(0);
  expect(await readFile(join(path, "maestrun/plugin.json"), "utf8")).toContain("maestrun");
});

test("an active run lock and malformed tasks prevent starting executors", async ({ project }) => {
  await setupRun(project.cwd);
  await executionProcesses(project);
  await mkdir(join(project.cwd, ".maestrun/run.lock"));
  expect((await cli(project.cwd, ["run", "--tasks", "tasks.json"])).stderr).toContain("run lock");
  await writeFile(join(project.cwd, "tasks.json"), "{broken");
  expect((await cli(project.cwd, ["run", "--tasks", "tasks.json"])).stderr).toContain(
    "malformed JSON",
  );
  await expect(readFile(project.log)).rejects.toMatchObject({ code: "ENOENT" });
});
