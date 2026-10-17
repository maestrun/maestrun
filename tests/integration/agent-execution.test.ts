import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { Config } from "../../src/contracts/workflow.js";
import type { StepInput } from "../../src/contracts/run.js";
import {
  executeStep,
  resolveTaskAgents,
  stepPrompt,
  taskStages,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { executionProcesses } from "../helpers/execution-processes.js";

const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "planning-model" }],
  execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
};

async function agentInput(cwd: string): Promise<StepInput> {
  await writeFile(
    join(cwd, "backend.md"),
    "---\nmodel: gpt-6.1-sol\nreasoning_effort: xhigh\n---\nImplement backend only.",
  );
  const [task] = await resolveTaskAgents(cwd, CONFIG, [
    {
      id: "backend",
      title: "Backend",
      instructions: "Implement the API",
      dependsOn: [],
      steps: ["implementation"],
      agents: { implementation: "backend.md" },
    },
  ]);
  if (!task) throw new Error("Missing task");
  const stage = taskStages(CONFIG, task)[0];
  if (!stage) throw new Error("Missing stage");
  return {
    cwd,
    task,
    stage,
    signal: new AbortController().signal,
    timeoutMs: 5000,
  };
}

test.for([false, true])(
  "sends the agent profile to Codex with conversation=%s",
  async (conversation, { project }) => {
    await executionProcesses(project);
    const input = {
      ...(await agentInput(project.cwd)),
      ...(conversation ? { conversationId: randomUUID() } : {}),
    };
    await executeStep(input);
    const record = JSON.parse((await readFile(project.log, "utf8")).trim());
    if (conversation)
      expect(record.params).toMatchObject({ model: "gpt-6.1-sol", effort: "xhigh" });
    else
      expect(record.args).toEqual(
        expect.arrayContaining(["--model", "gpt-6.1-sol", 'model_reasoning_effort="xhigh"']),
      );
    const profile = record.input
      .split("\n")
      .find((line: string) => line.startsWith("Maestrun execution request: "));
    expect(JSON.parse(profile.slice("Maestrun execution request: ".length))).toMatchObject({
      executor: "codex",
      model: "gpt-6.1-sol",
      effort: "xhigh",
      agent: "backend.md",
    });
    expect(record.input).toContain(
      "process arguments and session files may not expose these settings",
    );
    const isolated = await stepPrompt({ ...input, cwd: project.bin, projectCwd: project.cwd });
    expect(isolated).toContain(JSON.stringify(join(project.cwd, "plan.md")));
    expect(isolated).toContain("Implement backend only.");
  },
);
