import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadTasks, parseTasks, taskStages } from "../../src/modules/execution/index.js";
import { CONFIG } from "../helpers/context.js";
import { test } from "../helpers/project.js";

const TASK = { id: "a", title: "A", instructions: "Implement A and verify", dependsOn: [] };

test.for([
  {},
  { version: 2, tasks: [TASK] },
  { version: 1, tasks: [] },
  { version: 1, tasks: [TASK, TASK] },
  ...[
    { id: "../a" },
    { title: "\n" },
    { instructions: "" },
    { dependsOn: "a" },
    { dependsOn: ["missing"] },
    { dependsOn: ["a"] },
    { target: "both" },
  ].map((change) => ({ version: 1, tasks: [{ ...TASK, ...change }] })),
  {
    version: 1,
    tasks: [
      { ...TASK, dependsOn: ["b"] },
      { ...TASK, id: "b", dependsOn: ["a"] },
    ],
  },
])("rejects an unsafe or impossible task graph: %j", (value) => {
  expect(() => parseTasks(value)).toThrow("Invalid task plan");
});

test("loads the same dependency graph from JSON and a Markdown block", async ({ project }) => {
  const tasks = [
    { ...TASK, dependsOn: ["b"] },
    { ...TASK, id: "b", target: "backend" },
  ];
  const json = JSON.stringify({ version: 1, tasks });
  await writeFile(join(project.cwd, "tasks.json"), json);
  await writeFile(join(project.cwd, "plan.md"), `# Plan\n\n\`\`\`maestrun-tasks\n${json}\n\`\`\``);
  expect(await loadTasks(project.cwd, "tasks.json")).toEqual(tasks);
  expect(await loadTasks(project.cwd, "plan.md")).toEqual(tasks);
});

test.for([
  "# Unstructured plan",
  "```maestrun-tasks\n{broken}\n```",
  "```maestrun-tasks\n{}\n```\n```maestrun-tasks\n{}\n```",
])("invalid plans fail before any execution: %j", async (content, { project }) => {
  await writeFile(join(project.cwd, "plan.md"), content);
  await expect(loadTasks(project.cwd, "plan.md")).rejects.toThrow("Invalid task plan");
});

test("target overrides apply only to implementation and planning is skipped", () => {
  const stage = { executor: "codex", model: "default-test" } as const;
  const target = { executor: "claude", model: "frontend-test", effort: "high" } as const;
  const config = {
    ...CONFIG,
    stages: [
      ...CONFIG.stages,
      { ...stage, id: "implementation" as const },
      { ...stage, id: "testing" as const },
    ],
    targets: { frontend: target, backend: stage },
  };
  expect(taskStages(config, { ...TASK, target: "frontend" })).toEqual([
    { id: "implementation", ...target },
    { id: "testing", ...stage },
  ]);
  expect(taskStages(config, TASK)[0]?.model).toBe("default-test");
});

test("a target's native effort does not inherit a different executor's stage effort", () => {
  const stage = {
    id: "implementation" as const,
    executor: "codex" as const,
    model: "base",
    effort: "ultra" as const,
  };
  const target = { executor: "claude" as const, model: "claude-exact" };
  const config = {
    ...CONFIG,
    stages: [...CONFIG.stages, stage],
    targets: { frontend: target, backend: target },
  };
  expect(taskStages(config, { ...TASK, target: "frontend" })[0]).toEqual({
    id: "implementation",
    ...target,
  });
});
