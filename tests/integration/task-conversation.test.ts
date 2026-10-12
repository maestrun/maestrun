import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import {
  executeStep,
  readConversation,
  sendTaskMessage,
} from "../../src/modules/execution/index.js";
import type { StepInput } from "../../src/contracts/run.js";
import { test } from "../helpers/project.js";
import { TASKS } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";

function step(cwd: string, executor: "codex" | "claude"): StepInput & { conversationId: string } {
  const task = TASKS[0];
  if (!task) throw new Error("Missing task");
  return {
    cwd,
    task,
    conversationId: randomUUID(),
    stage: { id: "implementation", executor, model: "test-model", effort: "high" },
    signal: new AbortController().signal,
    timeoutMs: 5000,
  };
}

async function active(input: StepInput & { conversationId: string }): Promise<void> {
  await vi.waitFor(async () => {
    expect((await readConversation(input.cwd, input.conversationId))?.active).toBe(true);
  });
}

test("Claude task sessions permit sandboxed local server checks", async ({ project }) => {
  await executionProcesses(project);
  await executeStep(step(project.cwd, "claude"));
  const { args, input } = JSON.parse(await readFile(project.log, "utf8")) as {
    args: string[];
    input: string;
  };
  expect(JSON.parse(args[args.indexOf("--settings") + 1] ?? "")).toMatchObject({
    sandbox: { network: { allowLocalBinding: true } },
  });
  expect(args[args.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
  expect(input).toContain("same shell command");
});

test.for(["codex", "claude"] as const)(
  "delivers %s instructions in the existing session",
  async (executor, { project }) => {
    await executionProcesses(project, "conversation");
    const onUsage = vi.fn();
    const input = { ...step(project.cwd, executor), onUsage };
    const result = executeStep(input);
    await active(input);
    const id = await sendTaskMessage(input.cwd, input.conversationId, "Also check empty inputs");
    await vi.waitFor(async () => {
      const conversation = await readConversation(input.cwd, input.conversationId);
      expect(conversation?.messages.find((entry) => entry.id === id)?.status).toBe(
        executor === "codex" ? "sent" : "queued",
      );
      expect(
        conversation?.messages.some((entry) => entry.text.includes("Working on the task")),
      ).toBe(true);
    });
    await writeFile(join(project.cwd, ".finish-execution"), "go");
    expect(await result).toContain("Also check empty inputs");
    expect(onUsage.mock.calls.reduce((sum, [usage]) => sum + usage.inputTokens, 0)).toBe(
      executor === "codex" ? 1000 : 1400,
    );
    expect(onUsage.mock.calls.reduce((sum, [usage]) => sum + usage.outputTokens, 0)).toBe(100);
    const conversation = await readConversation(input.cwd, input.conversationId);
    expect(conversation?.active).toBe(false);
    expect(conversation?.messages.find((entry) => entry.id === id)?.status).toBe("sent");
    const log = await readFile(project.log, "utf8");
    expect(log).toContain(executor === "codex" ? '"expectedTurnId":"task-turn"' : "--input-format");
    if (executor === "codex") expect(log).toContain("sandbox_workspace_write.network_access=true");
    await expect(sendTaskMessage(input.cwd, input.conversationId, "Too late")).rejects.toThrow();
  },
);

test("keeps instructions isolated between parallel task sessions", async ({ project }) => {
  await executionProcesses(project, "conversation");
  const first = step(project.cwd, "codex");
  const second = step(project.cwd, "codex");
  const results = Promise.all([executeStep(first), executeStep(second)]);
  await Promise.all([active(first), active(second)]);
  const id = await sendTaskMessage(first.cwd, first.conversationId, "Only first task");
  await vi.waitFor(async () => {
    expect(
      (await readConversation(first.cwd, first.conversationId))?.messages.find(
        (entry) => entry.id === id,
      )?.status,
    ).toBe("sent");
  });
  await writeFile(join(project.cwd, ".finish-execution"), "go");
  const [a, b] = await results;
  expect(a).toContain("Only first task");
  expect(b).not.toContain("Only first task");
});

test("cancellation rejects Claude instructions still waiting for a turn", async ({ project }) => {
  await executionProcesses(project, "conversation");
  const input = step(project.cwd, "claude");
  const controller = new AbortController();
  const result = expect(executeStep({ ...input, signal: controller.signal })).rejects.toThrow();
  await active(input);
  const id = await sendTaskMessage(input.cwd, input.conversationId, "Waiting instructions");
  await vi.waitFor(async () => {
    expect(
      (await readConversation(input.cwd, input.conversationId))?.messages.find(
        (entry) => entry.id === id,
      )?.status,
    ).toBe("queued");
  });
  controller.abort();
  await result;
  const conversation = await readConversation(input.cwd, input.conversationId);
  expect(conversation?.active).toBe(false);
  expect(conversation?.messages.find((entry) => entry.id === id)?.status).toBe("rejected");
});
