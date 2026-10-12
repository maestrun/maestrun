import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { readSession } from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test("sample --background detaches and reconnects to the same worker until completion", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "gate");
  const before = await readFile(join(project.cwd, ".maestrun/config.json"), "utf8");
  const cli = sessionCli(project.cwd, ["sample", "run", "--background"], false);
  let directory: string | undefined;
  try {
    await cli.wait("Sample project:");
    directory = /Sample project: ([^\r\n]+)/u.exec(cli.output())?.[1];
    if (!directory) throw new Error("Missing sample directory");
    expect(await cli.exited).toBe(0);
    expect(cli.output()).toContain("Tasks are running in the background");
    expect(cli.output()).toContain("To reopen this sample");
    await reconnect(directory);
    expect(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8")).toBe(before);
  } finally {
    cli.kill();
    if (directory) await stopSession(directory);
  }
});

async function reconnect(directory: string): Promise<void> {
  const session = await readSession(directory);
  expect(session?.status).toBe("running");
  const cli = sessionCli(directory, [], false);
  try {
    await cli.wait("sample-add");
    expect((await readSession(directory))?.id).toBe(session?.id);
    await writeFile(join(directory, ".finish-execution"), "go");
    expect(await cli.exited).toBe(0);
    expect(cli.output()).toContain("Completed 3/3 tasks.");
    expect((await readSession(directory))?.status).toBe("completed");
  } finally {
    cli.kill();
  }
}
