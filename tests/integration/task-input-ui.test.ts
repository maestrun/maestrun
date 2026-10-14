import { expect, vi } from "vitest";
import { readCheckpoint, executeStep } from "../../src/modules/execution/index.js";
import { StepInputRequired } from "../../src/shared/errors.js";
import { randomUUID } from "node:crypto";
import { test } from "../helpers/project.js";
import { setupRun, TASKS } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";

test.for(["needs-input", "native-input"])(
  "%s becomes a resumable hold",
  async (mode, { project }) => {
    await executionProcesses(project, mode);
    const task = TASKS[0];
    if (!task) throw new Error("Missing task");
    const input = {
      cwd: project.cwd,
      task,
      stage: { id: "implementation" as const, executor: "codex" as const, model: "test" },
      timeoutMs: 5000,
      signal: new AbortController().signal,
      conversationId: randomUUID(),
    };
    await expect(executeStep(input)).rejects.toBeInstanceOf(StepInputRequired);
    await expect(
      executeStep({
        ...input,
        conversationId: randomUUID(),
        inputRequests: [
          {
            id: randomUUID(),
            stage: "implementation",
            question: "Which region?",
            summary: "Need a decision",
            answer: "Brazil",
          },
        ],
      }),
    ).resolves.toContain("passed");
  },
);

test("the pending list asks the model question, preserves it on Esc, and saves answers", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "needs-input");
  const cli = sessionCli(project.cwd, ["run", "--tasks", "tasks.json"]);
  try {
    await cli.wait("2 awaiting input");
    expect(cli.output()).toContain("On hold");
    await openAnswer(cli);
    expect(cli.output()).toContain("Which region should this task use?");
    const offset = cli.output().length;
    cli.send("\x1b");
    await vi.waitFor(() => expect(cli.output().slice(offset)).toContain("2 awaiting input"));
    await answer(cli, "Brazil");
    await vi.waitFor(async () =>
      expect((await readCheckpoint(project.cwd))[0]?.inputRequests?.[0]?.answer).toBe("Brazil"),
    );
    await answer(cli, "Portugal");
    await vi.waitFor(async () =>
      expect((await readCheckpoint(project.cwd))[2]?.inputRequests?.[0]?.answer).toBe("Portugal"),
    );
    await cli.wait("On hold");
  } finally {
    await stopSession(project.cwd);
    cli.kill();
    await cli.exited;
  }
});

async function openAnswer(cli: ReturnType<typeof sessionCli>): Promise<void> {
  const offset = cli.output().length;
  cli.send("i");
  await vi.waitFor(() => expect(cli.output().slice(offset)).toContain("Your answer"), {
    timeout: 5000,
  });
}
async function answer(cli: ReturnType<typeof sessionCli>, text: string): Promise<void> {
  await openAnswer(cli);
  const offset = cli.output().length;
  cli.send(`${text}\r`);
  await vi.waitFor(() => expect(cli.output().slice(offset)).toContain("task command center"));
}
