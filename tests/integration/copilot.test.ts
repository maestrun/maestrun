import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { generateCopilot } from "../../src/modules/executors/index.js";
import {
  executeStep,
  readConversation,
  sendTaskMessage,
} from "../../src/modules/execution/index.js";
import { generateInteractivePlan } from "../../src/modules/planning/index.js";
import { loadConfig } from "../../src/config/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import { scriptedUi } from "../helpers/ui.js";
import { installCopilot } from "../helpers/copilot.js";
import { test } from "../helpers/project.js";
import type { StepInput } from "../../src/contracts/run.js";

function step(cwd: string): StepInput {
  return {
    cwd,
    signal: new AbortController().signal,
    timeoutMs: 5000,
    task: { id: "test", title: "Test", instructions: "Implement and test", dependsOn: [] },
    stage: { id: "implementation", executor: "copilot", model: "copilot-test", effort: "high" },
  };
}

test("initializes a Copilot workflow with discovered models and effort", async ({ project }) => {
  await installCopilot(project);
  const script = scriptedUi([[], "copilot", "copilot-test", "high", false, "sequential"]);
  await initialize({ ...step(project.cwd), ui: script.ui });
  expect((await loadConfig(project.cwd)).config?.stages[0]).toEqual({
    id: "planning",
    executor: "copilot",
    model: "copilot-test",
    effort: "high",
  });
  expect(script.remaining()).toBe(0);
});

test("generates plans with read-only tools and displays assistant output", async ({ project }) => {
  await installCopilot(project);
  const output: string[] = [];
  const result = await generateCopilot({
    ...step(project.cwd),
    model: "copilot-test",
    prompt: "Plan",
    onOutput: (text) => output.push(text),
  });
  expect(result).toContain("Acceptance criteria");
  expect(output.join("")).toContain(result);
  const log = await readFile(project.log, "utf8");
  expect(log).toContain("--available-tools=view,glob,grep");
  expect(log).toContain("--deny-tool=write,shell");
  expect(log).not.toContain("--allow-all");
});

test("interactive Copilot planning includes answers in subsequent requests", async ({
  project,
}) => {
  await installCopilot(project);
  const script = scriptedUi(["Small scope"]);
  const input = step(project.cwd);
  const result = await generateInteractivePlan({
    ...input,
    ui: script.ui,
    draft: {
      config: { version: 1, stages: [{ ...input.stage, id: "planning" }] },
      requirements: { source: "Pasted", text: "Build a command" },
    },
  });
  expect(result).toContain("Acceptance criteria");
  expect(await readFile(project.log, "utf8")).toContain("Small scope");
  expect(script.remaining()).toBe(0);
});

test("executes with the exact model and effort and permitted editing tools", async ({
  project,
}) => {
  await installCopilot(project);
  expect(await executeStep(step(project.cwd))).toBe("Checks passed");
  const log = await readFile(project.log, "utf8");
  expect(log).toContain('"--reasoning-effort","high"');
  expect(log).toContain("copilot-test");
  expect(log).toContain("--allow-tool=write,shell");
});

test.for(["malformed", "failure", "incomplete", "empty", "refactor", "result-failure"])(
  "rejects %s execution",
  async (mode, { project }) => {
    await installCopilot(project, mode);
    await expect(executeStep(step(project.cwd))).rejects.toThrow();
  },
);

test("queues instructions and resumes the same Copilot session", async ({ project }) => {
  await installCopilot(project, "conversation");
  const input = { ...step(project.cwd), conversationId: randomUUID() };
  const result = executeStep(input);
  await vi.waitFor(async () =>
    expect((await readConversation(input.cwd, input.conversationId))?.active).toBe(true),
  );
  const id = await sendTaskMessage(input.cwd, input.conversationId, "Also check empty inputs");
  await writeFile(join(input.cwd, ".finish-execution"), "go");
  expect(await result).toBe("Also check empty inputs");
  const conversation = await readConversation(input.cwd, input.conversationId);
  expect(conversation?.active).toBe(false);
  expect(conversation?.messages.find((message) => message.id === id)?.status).toBe("sent");
  const logs = (await readFile(project.log, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { args: string[] });
  expect(logs).toHaveLength(2);
  expect(logs[0]?.args).toEqual(logs[1]?.args);
});

test("times out and cancels Copilot processes", async ({ project }) => {
  await installCopilot(project, "hang");
  await expect(executeStep({ ...step(project.cwd), timeoutMs: 50 })).rejects.toThrow("timed out");
  const controller = new AbortController();
  controller.abort();
  await expect(executeStep({ ...step(project.cwd), signal: controller.signal })).rejects.toThrow(
    "Cancelled",
  );
});
