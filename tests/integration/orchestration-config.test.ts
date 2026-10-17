import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { Config, Stage } from "../../src/contracts/workflow.js";
import { createPlan, prepareOrchestratorPlan } from "../../src/modules/planning/index.js";
import { loadTasks, ORCHESTRATOR_ID, runWorkflow } from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "planner" }],
  execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" },
};
const PLAN = `### Task backend: Backend
- Depends on: none
- Steps: implementation, review
- Agents: {"implementation":"backend.md"}

Implement the API.

### Task frontend: Frontend
- Depends on: backend
- Steps: implementation
- Agents: {"implementation":"frontend.md"}

Implement the interface.
`;
const followup = {
  id: "docs",
  title: "Docs",
  dependsOn: ["frontend"],
  steps: ["custom:Write"],
  instructions: "Document.",
};

async function saved(cwd: string) {
  return JSON.parse(await readFile(join(cwd, ".maestrun/config.json"), "utf8")) as Config & {
    note: string;
    orchestration?: {
      strategy: string;
      tasks: { id: string; stages: (Omit<Stage, "effort"> & { effort: string | null })[] }[];
    };
  };
}

async function setup(cwd: string, config = CONFIG) {
  await setupRun(cwd, config);
  await writeFile(join(cwd, ".maestrun/config.json"), JSON.stringify({ ...config, note: "keep" }));
  await writeFile(join(cwd, "plan.md"), PLAN);
  await writeFile(
    join(cwd, "backend.md"),
    "---\nmodel: gpt-backend\nreasoning_effort: xhigh\n---\nBackend.",
  );
  await writeFile(
    join(cwd, "frontend.md"),
    "---\nmodel: claude-frontend\neffort: max\n---\nFrontend.",
  );
  return { cwd, ui: scriptedUi([]).ui, signal: new AbortController().signal };
}

test("planning saves task-specific models and efforts while preserving workflow settings", async ({
  project,
}) => {
  const input = await setup(project.cwd);
  await createPlan(input, {
    wizard: async () => ({ config: CONFIG, requirements: { text: "Build", source: "prompt.md" } }),
    detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }),
    generate: async () => PLAN,
  });
  const config = await saved(project.cwd);
  expect(config).toMatchObject({ ...CONFIG, note: "keep", orchestration: { strategy: "agent" } });
  expect(config.orchestration?.tasks[0]?.stages).toMatchObject([
    { id: "implementation", model: "gpt-backend", effort: "xhigh", agent: "backend.md" },
    { id: "review", model: "planner", effort: null },
  ]);
  expect(config.orchestration?.tasks[1]?.stages).toEqual([
    {
      id: "implementation",
      executor: "claude",
      model: "claude-frontend",
      effort: "max",
      agent: "frontend.md",
    },
  ]);
});

test("reusing a plan refreshes its saved agent assignments", async ({ project }) => {
  const input = await setup(project.cwd);
  await prepareOrchestratorPlan({ ...input, ui: scriptedUi([true]).ui });
  await writeFile(
    join(project.cwd, "backend.md"),
    "---\nmodel: gpt-updated\neffort: high\n---\nBackend.",
  );
  await prepareOrchestratorPlan({ ...input, ui: scriptedUi([true]).ui });
  expect((await saved(project.cwd)).orchestration?.tasks[0]?.stages[0]).toMatchObject({
    model: "gpt-updated",
    effort: "high",
  });
});

test.for(["plan", "agent"] as const)(
  "%s saves before workers and keeps dry-run read-only",
  async (orchestrator, { project }) => {
    const input = await setup(project.cwd, {
      ...CONFIG,
      execution: { mode: "sequential", concurrency: 1, orchestrator },
    });
    const original = await saved(project.cwd);
    await runWorkflow({ ...input, dryRun: true }, vi.fn());
    expect(await saved(project.cwd)).toEqual(original);
    const tasks = await loadTasks(project.cwd, "plan.md");
    let round = 0;
    await runWorkflow(input, async ({ task, stage }) => {
      if (task.id === ORCHESTRATOR_ID)
        return JSON.stringify(
          ++round === 3
            ? { done: true }
            : { done: false, tasks: round === 1 ? tasks : [...tasks, followup] },
        );
      const config = await saved(project.cwd);
      const assigned = config.orchestration?.tasks
        .find((entry) => entry.id === task.id)
        ?.stages.find((entry) => entry.id === stage.id);
      expect(assigned).toEqual({ ...stage, effort: stage.effort ?? null });
      return "Done";
    });
    expect((await saved(project.cwd)).orchestration?.tasks.map((task) => task.id)).toEqual(
      orchestrator === "agent" ? ["backend", "frontend", "docs"] : ["backend", "frontend"],
    );
  },
);

test("invalid coordination preserves the last saved task configuration", async ({ project }) => {
  const input = await setup(project.cwd);
  await prepareOrchestratorPlan({ ...input, ui: scriptedUi([true]).ui });
  const previous = await saved(project.cwd);
  await expect(
    runWorkflow(input, async () => JSON.stringify({ done: false, tasks: [{ id: "bad" }] })),
  ).rejects.toThrow();
  expect(await saved(project.cwd)).toEqual(previous);
});
