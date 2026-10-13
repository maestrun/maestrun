import { expect } from "vitest";
import { executionProcesses } from "../helpers/execution-processes.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test("sends instructions from the execution view and keeps the conversation after reconnecting", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: RUN_CONFIG.stages.map((stage) => ({ ...stage, effort: "high" })),
  });
  await executionProcesses(project, "conversation");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("Effort: high");
    cli.send("\r");
    cli.send("l");
    await cli.wait("Working on the task.");
    cli.send("i");
    await cli.wait("Instructions for a");
    cli.send("Also check empty inputs\r");
    await cli.wait("Instructions sent");
    await cli.wait("Applying your instructions.");
    cli.send("\x03");
    await cli.wait("Run in background");
    cli.send("\r");
    expect(await cli.exited).toBe(0);
    await reconnect(project.cwd);
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});

async function reconnect(cwd: string): Promise<void> {
  const cli = sessionCli(cwd, []);
  try {
    await cli.wait("Effort: high");
    cli.send("\r");
    cli.send("l");
    cli.send("\x1b[B".repeat(8));
    await cli.wait("Also check empty inputs");
    await cli.wait("You · sent");
  } finally {
    cli.kill();
    await cli.exited;
  }
}

test("Ctrl+C while composing instructions offers background or cancel", async ({ project }) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "conversation");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("● Working");
    cli.send("i");
    await cli.wait("Instructions for a");
    cli.send("\x03");
    await cli.wait("Run in background");
    await cli.wait("Cancel execution");
    cli.send("\r");
    expect(await cli.exited).toBe(0);
  } finally {
    cli.kill();
    await stopSession(project.cwd);
  }
});
