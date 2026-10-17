import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { Config } from "../../src/contracts/workflow.js";
import {
  parseTaskDocument,
  parseTasks,
  resolveTaskAgents,
  taskStages,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";

const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "default-model", effort: "ultra" }],
  execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" },
};
const TASK = {
  id: "a",
  title: "A",
  instructions: "Research",
  dependsOn: [],
  steps: ["custom:Research"] as const,
};

test.for([
  ["# No model", "default-model", "codex", "ultra"],
  ["---\nmodel: inherit\n---", "default-model", "codex", "ultra"],
  ["---\nmodel: gpt-6.1-sol\nreasoning_effort: xhigh\n---", "gpt-6.1-sol", "codex", "xhigh"],
  ["---\nmodel: gpt-6-luna\nmodel_reasoning_effort: max\n---", "gpt-6-luna", "codex", "max"],
  ["---\nmodel: 'claude-custom' # chosen\n---", "claude-custom", "claude", undefined],
  ["---\nmodel: grok-custom\n---", "grok-custom", "grok", undefined],
  [
    '---\r\nmodel: "custom-model"\r\nexecutor: copilot\r\neffort: high\r\n---',
    "custom-model",
    "copilot",
    "high",
  ],
] as const)(
  "resolves model metadata: %s",
  async ([content, model, executor, effort], { project }) => {
    const path = join(project.root, "agent.md");
    await writeFile(path, content);
    const [task] = await resolveTaskAgents(project.cwd, CONFIG, [
      { ...TASK, agents: { "custom:Research": path } },
    ]);
    if (!task) throw new Error("Missing task");
    const stage = taskStages(CONFIG, task)[0];
    expect(stage).toMatchObject({ model, executor, agent: path });
    expect(stage?.effort).toBe(effort);
  },
);

test.for([
  "model: ''",
  "model: [one, two]",
  "model: |\n  custom-model",
  "model: a\nmodel: b",
  "model: bad model",
  "model: chosen\nexecutor: unknown",
  "model: chosen\neffort: impossible",
  "model: chosen\nreasoning_effort: impossible",
  "model: chosen\neffort: high\nreasoning_effort: low",
  "model: auto\nexecutor: copilot",
])("rejects invalid agent metadata instead of falling back: %s", async (header, { project }) => {
  await writeFile(join(project.cwd, "agent.md"), `---\n${header}\n---\nInstructions`);
  await expect(
    resolveTaskAgents(project.cwd, CONFIG, [
      { ...TASK, agents: { "custom:Research": "agent.md" } },
    ]),
  ).rejects.toThrow("Invalid");
});

test("rejects an unterminated header", async ({ project }) => {
  await writeFile(join(project.cwd, "agent.md"), "---\nmodel: chosen");
  await expect(
    resolveTaskAgents(project.cwd, CONFIG, [
      { ...TASK, agents: { "custom:Research": "agent.md" } },
    ]),
  ).rejects.toThrow("frontmatter");
});

test.for([
  null,
  [],
  {},
  { review: "agent.md" },
  { "custom:Research": "" },
  { "custom:Research": 1 },
  { "custom:Research": "a\nb" },
])("rejects invalid agent bindings %j", (agents) => {
  expect(() => parseTasks({ version: 1, tasks: [{ ...TASK, agents }] })).toThrow("Agents mapping");
});

test("parses Markdown agent bindings and does not trust model assignments returned by the coordinator", () => {
  const agents = { "custom:Research": "some directory/agent.md" };
  expect(
    parseTaskDocument(
      `### Task a: A\n- Depends on: none\n- Steps: custom:Research\n- Agents: ${JSON.stringify(agents)}\n\nResearch`,
    ),
  ).toEqual([{ ...TASK, agents }]);
  expect(
    parseTasks({
      version: 1,
      tasks: [{ ...TASK, agents, agentAssignments: { "custom:Research": { model: "invented" } } }],
    })[0]?.agentAssignments,
  ).toBeUndefined();
  expect(() =>
    parseTaskDocument("### Task a: A\n- Depends on: none\n- Agents: not-json\n\nResearch"),
  ).toThrow("Agents must be a JSON object");
});

test("requires orchestration and prevents unresolved bindings from silently using Planning", async ({
  project,
}) => {
  const task = { ...TASK, agents: { "custom:Research": "agent.md" } };
  expect(() => taskStages(CONFIG, task)).toThrow("unresolved agent");
  await expect(
    resolveTaskAgents(project.cwd, { version: 1, stages: CONFIG.stages }, [task]),
  ).rejects.toThrow("require orchestration");
});
