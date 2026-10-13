import { expect, vi } from "vitest";
import { readSession } from "../../src/modules/execution/index.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test.for(["failed", "refactor"])(
  "%s after repairs keeps the UI navigable",
  async (mode, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 1, maxRepairs: 1 },
    });
    await executionProcesses(project, mode);
    const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
    try {
      await vi.waitFor(
        async () => expect((await readSession(project.cwd))?.status).toBe("failed"),
        { timeout: 5000 },
      );
      await cli.wait("Esc close");
      expect(cli.output()).not.toContain("Recovery");
      cli.send("\r");
      await cli.wait("Task details");
      await cli.wait(mode === "failed" ? "A test failed" : "Update the validation checks");
      await exitFailedView(cli);
    } finally {
      cli.kill();
      await stopSession(project.cwd);
    }
  },
);

async function exitFailedView(cli: ReturnType<typeof sessionCli>): Promise<void> {
  cli.send("\x1b");
  await vi.waitFor(() =>
    expect(cli.output().lastIndexOf("Esc close")).toBeGreaterThan(
      cli.output().lastIndexOf("Task details"),
    ),
  );
  cli.send("\x1b");
  await cli.wait("Recovery");
  cli.send("\x1b[B\x1b[B\x1b[B\r");
  expect(await cli.exited).toBe(1);
}
