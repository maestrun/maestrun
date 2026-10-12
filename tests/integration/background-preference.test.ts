import { expect } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { readSession } from "../../src/modules/execution/index.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

async function reconnectAndCancel(cwd: string): Promise<void> {
  const cli = sessionCli(cwd, []);
  try {
    await cli.wait("code-test");
    cli.send("\x03");
    await cli.wait("Cancel execution");
    cli.send("\x1b[B\r");
    expect(await cli.exited).toBe(130);
  } finally {
    cli.kill();
  }
}

test("the user can save always-background in the process menu and still reconnect to cancel", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "gate");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("code-test");
    cli.send("\x03");
    await cli.wait("Always run in background for this project");
    cli.send("\x1b[B\x1b[B\r");
    expect(await cli.exited).toBe(0);
    expect((await loadConfig(project.cwd)).config).toEqual({
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 2, background: true },
    });
    const session = await readSession(project.cwd);
    expect(session?.status).toBe("running");
    await reconnectAndCancel(project.cwd);
    expect(await readSession(project.cwd)).toMatchObject({ id: session?.id, status: "cancelled" });
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});

test.for([[], ["--no-background"]])(
  "saved background preference supports override %j",
  async (flags, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode: "sequential", concurrency: 2, background: true },
    });
    await executionProcesses(project, "gate");
    const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json", ...flags]);
    try {
      if (flags.length) {
        await cli.wait("code-test");
        cli.send("\x03");
        await cli.wait("Cancel execution");
        cli.send("\x1b[B\r");
      }
      expect(await cli.exited).toBe(flags.length ? 130 : 0);
      expect((await readSession(project.cwd))?.status).toBe(flags.length ? "cancelled" : "running");
      expect((await loadConfig(project.cwd)).config?.execution?.background).toBe(true);
    } finally {
      cli.kill();
      await stopSession(project.cwd);
    }
  },
);
