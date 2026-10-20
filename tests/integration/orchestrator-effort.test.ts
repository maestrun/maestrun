import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { setupRun, RUN_CONFIG } from "../helpers/run.js";
import { runInput } from "../helpers/worktrees.js";
import { test } from "../helpers/project.js";

test("orchestrator effort defaults reach agents and stages while explicit agent efforts win", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: RUN_CONFIG.stages.map((stage) =>
      stage.id === "planning" ? { ...stage, effort: "high" } : stage,
    ),
    execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
  });
  await setupAgentTasks(project.cwd);
  const efforts: Record<string, unknown> = {};
  await runWorkflow(runInput(project.cwd), async ({ task, stage }) => {
    efforts[`${task.id}/${stage.id}`] = stage.effort;
    return "Verified";
  });
  expect(efforts).toEqual({
    "a/implementation": "high",
    "a/testing": "low",
    "b/implementation": "high",
    "b/testing": "high",
  });
});

async function setupAgentTasks(cwd: string): Promise<void> {
  await mkdir(join(cwd, "agents"));
  await writeFile(join(cwd, "agents/default.md"), "---\nmodel: gpt-test\n---\nImplement.");
  await writeFile(
    join(cwd, "agents/override.md"),
    "---\nmodel: gpt-test\nreasoning_effort: low\n---\nVerify.",
  );
  await writeFile(
    join(cwd, "tasks.json"),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          id: "a",
          title: "A",
          instructions: "Implement",
          dependsOn: [],
          steps: ["implementation", "testing"],
          agents: { implementation: "agents/default.md", testing: "agents/override.md" },
        },
        { id: "b", title: "B", instructions: "Implement", dependsOn: [] },
      ],
    }),
  );
}
