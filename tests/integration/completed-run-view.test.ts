import { readFile } from "node:fs/promises";
import { expect, vi } from "vitest";
import { executionProcesses } from "../helpers/execution-processes.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test("completed workflows reopen for navigation without executing tasks again", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project);
  const first = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"], false);
  expect(await first.exited).toBe(0);
  const calls = await readFile(project.log, "utf8");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("Esc close");
    cli.send("\x1b[B");
    await cli.wait("› b");
    cli.send("\r");
    await cli.wait("Task details");
    cli.send("\x1b");
    await vi.waitFor(() =>
      expect(cli.output().lastIndexOf("Esc close")).toBeGreaterThan(
        cli.output().lastIndexOf("Task details"),
      ),
    );
    cli.send("\x1b");
    expect(await cli.exited).toBe(0);
    expect(await readFile(project.log, "utf8")).toBe(calls);
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});
