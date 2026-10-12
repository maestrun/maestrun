import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { readSession } from "../../src/modules/execution/index.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test.for([[], ["run"]])(
  "Ctrl+C backgrounds the worker and %j reconnects to cancel the same run",
  async (args, { project }) => {
    await setupRun(project.cwd);
    await executionProcesses(project, "gate");
    const first = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
    try {
      await first.wait("code-test");
      const session = await readSession(project.cwd);
      first.send("\x03");
      await first.wait("Run in background");
      first.send("\r");
      expect(await first.exited).toBe(0);
      expect((await readSession(project.cwd))?.status).toBe("running");
      await reconnectAndCancel(project.cwd, args);
      expect((await readSession(project.cwd))?.id).toBe(session?.id);
      expect((await readSession(project.cwd))?.status).toBe("cancelled");
      expect((await readFile(project.log, "utf8")).trim().split("\n")).toHaveLength(1);
    } finally {
      first.kill();
      await stopSession(project.cwd);
    }
  },
);

async function reconnectAndCancel(cwd: string, args: string[]): Promise<void> {
  const next = sessionCli(cwd, args);
  try {
    await next.wait("code-test");
    next.send("\x03");
    await next.wait("Cancel execution");
    next.send("\x1b[B\r");
    expect(await next.exited).toBe(130);
  } finally {
    next.kill();
  }
}

test("a background run completes after the launcher exits and reopening shows its final view", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "gate");
  const first = sessionCli(project.cwd, ["run", "--tasks", "tasks.json", "--background"], false);
  try {
    expect(await first.exited).toBe(0);
    const session = await readSession(project.cwd);
    await writeFile(join(project.cwd, ".finish-execution"), "");
    await vi.waitFor(
      async () => expect((await readSession(project.cwd))?.status).toBe("completed"),
      { timeout: 5000 },
    );
    const next = sessionCli(project.cwd, []);
    try {
      await next.wait("3/3 tasks");
      next.send("\x1b");
      expect(await next.exited).toBe(0);
    } finally {
      next.kill();
    }
    expect((await readSession(project.cwd))?.id).toBe(session?.id);
    expect((await readFile(project.log, "utf8")).trim().split("\n")).toHaveLength(6);
  } finally {
    first.kill();
    await stopSession(project.cwd);
  }
});

test("SIGTERM cancels while the Ctrl+C choice is open", async ({ project }) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "gate");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("code-test");
    cli.send("\x03");
    await cli.wait("Run in background");
    cli.kill();
    expect(await cli.exited).toBe(130);
    expect((await readSession(project.cwd))?.status).toBe("cancelled");
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});
