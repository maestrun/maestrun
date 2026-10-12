import { randomUUID } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { generateGrok } from "../../src/modules/executors/index.js";
import {
  executeStep,
  readConversation,
  sendTaskMessage,
} from "../../src/modules/execution/index.js";
import { generateInteractivePlan } from "../../src/modules/planning/index.js";
import { loadConfig } from "../../src/config/index.js";
import { initialize } from "../../src/modules/workflow/index.js";
import type { StepInput } from "../../src/contracts/run.js";
import { scriptedUi } from "../helpers/ui.js";
import { installGrok } from "../helpers/grok.js";
import { test } from "../helpers/project.js";

function step(cwd: string): StepInput {
  return {
    cwd,
    signal: new AbortController().signal,
    timeoutMs: 5000,
    task: { id: "test", title: "Test", instructions: "Implement and test", dependsOn: [] },
    stage: { id: "implementation", executor: "grok", model: "grok-test", effort: "high" },
  };
}

async function logs(path: string): Promise<{ args: string[]; input: string; mode: number }[]> {
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("initializes Grok with discovered models and persists the selected effort", async ({
  project,
}) => {
  await installGrok(project);
  const script = scriptedUi([[], "grok", "grok-test", "high", false, "sequential"]);
  await initialize({ ...step(project.cwd), ui: script.ui });
  expect((await loadConfig(project.cwd)).config?.stages[0]).toEqual({
    ...step(project.cwd).stage,
    id: "planning",
  });
  expect(script.remaining()).toBe(0);
});

test("plans with read-only tools, streams text and cleans up private prompt files", async ({
  project,
}) => {
  await installGrok(project);
  const output: string[] = [];
  const prompt = "Plan\n".repeat(40000);
  const result = await generateGrok({
    ...step(project.cwd),
    model: "grok-test",
    prompt,
    onOutput: (text) => output.push(text),
  });
  expect(output.join("")).toBe(result);
  const [log] = await logs(project.log);
  expect(log?.input).toBe(prompt);
  expect(log?.mode).toBe(0o600);
  expect(log?.args).toEqual(
    expect.arrayContaining(["read-only", "read_file,list_dir,grep_search", "--deny", "Bash"]),
  );
  expect(log?.args).not.toContain(prompt);
  const path = log?.args[(log?.args.indexOf("--prompt-file") ?? -1) + 1];
  expect(path).toBeTruthy();
  await expect(access(path ?? "")).rejects.toThrow();
});

test("supports interactive planning questions", async ({ project }) => {
  await installGrok(project);
  const input = step(project.cwd);
  const script = scriptedUi(["Small scope"]);
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
});

test("executes with workspace tools, model, effort and token usage", async ({ project }) => {
  await installGrok(project);
  const onUsage = vi.fn();
  expect(await executeStep({ ...step(project.cwd), onUsage })).toBe("Checks passed");
  expect(onUsage).toHaveBeenCalledWith({ inputTokens: 12, outputTokens: 4 });
  expect((await logs(project.log))[0]?.args).toEqual(
    expect.arrayContaining([
      "workspace",
      "--allow",
      "Bash",
      "--model",
      "grok-test",
      "--reasoning-effort",
      "high",
    ]),
  );
});

test.for(["malformed", "failure", "incomplete", "empty", "truncated", "wrong-model", "refactor"])(
  "rejects %s execution and cleans up its prompt",
  async (mode, { project }) => {
    await installGrok(project, mode);
    await expect(executeStep(step(project.cwd))).rejects.toThrow();
    const [log] = await logs(project.log);
    await expect(
      access(log?.args[(log?.args.indexOf("--prompt-file") ?? -1) + 1] ?? ""),
    ).rejects.toThrow();
  },
);

test("queues messages and resumes the same Grok session", async ({ project }) => {
  await installGrok(project, "conversation");
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
  const [first, second] = await logs(project.log);
  const sessionId = first?.args[(first?.args.indexOf("--session-id") ?? -1) + 1];
  expect(second?.args[(second?.args.indexOf("--resume") ?? -1) + 1]).toBe(sessionId);
  expect(second?.args).not.toContain("--session-id");
});

test("times out and cancels Grok processes", async ({ project }) => {
  await installGrok(project, "hang");
  await expect(executeStep({ ...step(project.cwd), timeoutMs: 100 })).rejects.toThrow("timed out");
  const controller = new AbortController();
  controller.abort();
  await expect(executeStep({ ...step(project.cwd), signal: controller.signal })).rejects.toThrow(
    "Cancelled",
  );
});
