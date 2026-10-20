import { expect } from "vitest";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { savedReport } from "../helpers/worktrees.js";

test("Space selects tasks for one terminal run and completed choices are disabled next time", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project);
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"], { selectAll: false });
  try {
    await cli.wait("All — run or resume all unfinished tasks");
    cli.send("\x1b[B\r");
    await cli.wait("Tasks for this run");
    cli.send(" \x1b[B \r");
    await cli.wait("Esc close");
    expect((await savedReport(project.cwd)).tasks.map((task) => task.status)).toEqual([
      "pending",
      "pending",
      "completed",
    ]);
    cli.send("\x1b");
    expect(await cli.exited).toBe(0);
    await checkCompleted(project.cwd);
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});

async function checkCompleted(cwd: string): Promise<void> {
  const cli = sessionCli(cwd, ["run", "--tasks", "tasks.json"], { selectAll: false });
  try {
    await cli.wait("All — run or resume all unfinished tasks");
    cli.send("\x1b[B\r");
    await cli.wait("(completed)");
    cli.send("\x03");
    expect(await cli.exited).toBe(130);
  } finally {
    cli.kill();
  }
}
