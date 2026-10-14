import { expect, vi } from "vitest";
import { loadTasks, prepareSample } from "../../src/modules/execution/index.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { savedReport } from "../helpers/worktrees.js";

test("the advanced failure has no dependencies or dependants", async ({ project }) => {
  await setupRun(project.cwd);
  const cwd = await prepareSample(project.cwd, undefined, "advanced");
  const tasks = await loadTasks(cwd, "plan.md");
  expect(tasks).toHaveLength(5);
  expect(tasks[0]).toMatchObject({ id: "sample-missing-input", dependsOn: [] });
  expect(tasks.every((task) => !task.dependsOn.includes("sample-missing-input"))).toBe(true);
  expect(tasks[3]).toMatchObject({
    id: "sample-compose",
    dependsOn: ["sample-add", "sample-clamp"],
  });
});

test(
  "advanced keeps the error visible while other tasks finish and remain inspectable",
  { timeout: 30000 },
  async ({ project }) => {
    await setupRun(project.cwd);
    const originalPath = process.env.PATH;
    await executionProcesses(project, "sample");
    vi.stubEnv("PATH", `${project.bin}:${originalPath}`);
    const cli = sessionCli(project.cwd, ["sample", "advanced"]);
    let directory: string | undefined;
    try {
      await chooseModel(cli);
      await cli.wait("! Failed");
      directory = /Sample project: ([^\r\n]+)/u.exec(cli.output())?.[1];
      if (!directory) throw new Error("Missing sample directory");
      const running = await savedReport(directory);
      expect(running.tasks[0]?.status).toBe("failed");
      expect(running.finishedAt).toBeUndefined();
      await confirmApproval(cli, directory);
      await inspectFinished(cli, directory);
    } finally {
      if (directory) await stopSession(directory);
      cli.kill();
      await cli.exited;
    }
  },
);

async function chooseModel(cli: ReturnType<typeof sessionCli>): Promise<void> {
  await cli.wait("Executor");
  cli.send("\r");
  await cli.wait("Codex model (type to search)");
  cli.send("\r");
  await cli.wait("Codex effort");
  cli.send("\r");
}

async function inspectFinished(cli: ReturnType<typeof sessionCli>, cwd: string): Promise<void> {
  await cli.wait("4/5 tasks");
  await cli.wait("Esc close");
  const report = await savedReport(cwd);
  expect(
    report.tasks.slice(1).every((task) => task.status === "completed" && task.worktree?.integrated),
  ).toBe(true);
  cli.send("\x1b[A".repeat(4) + "\r");
  await cli.wait("ENOENT: sample-required-input.json is missing");
  cli.send("\r\x1b[B\x1b[B\x1b[B\r");
  await cli.wait("sample-compose — Use both integrated results");
  await cli.wait("Tests and acceptance criteria passed");
  cli.send("\r\x1b");
  expect(await cli.exited).toBe(1);
}

async function confirmApproval(cli: ReturnType<typeof sessionCli>, cwd: string): Promise<void> {
  await cli.wait("1 awaiting input");
  const task = (await savedReport(cwd)).tasks.find((entry) => entry.id === "sample-confirmation");
  expect(task?.status).toBe("on_hold");
  expect(task?.inputRequests?.[0]?.summary).toContain("simulated PR approval");
  cli.send("\r");
  await cli.wait("Your answer");
  await cli.wait("Simulated approval: type continue");
  const offset = cli.output().length;
  cli.send("continue\r");
  await vi.waitFor(() => {
    const after = cli.output().slice(offset);
    // Earlier frames may precede the worker acknowledging the saved answer.
    const current = after.slice(after.lastIndexOf("\x1b[H"));
    expect(current).toContain("Answer saved.");
    expect(current).toContain("Input 0");
    expect(current).not.toContain("On hold · awaiting your input");
    expect(current).not.toContain("No pending input.");
  });
}
