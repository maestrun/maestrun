import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { Config } from "../../src/contracts/workflow.js";
import type { RunReport } from "../../src/contracts/run.js";
import { loadTasks, ORCHESTRATOR_ID, runWorkflow } from "../../src/modules/execution/index.js";
import { StepFailedError } from "../../src/shared/errors.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "planning-model" }],
  execution: { mode: "sequential", concurrency: 1, orchestrator: "agent", maxRepairs: 0 },
};
const PLAN = `### Task a: Research
- Depends on: none
- Steps: custom:Research, review
- Agents: {"custom:Research":"agent.md","review":"agent.md"}

Research then review.
`;

async function setup(cwd: string, model: string, plan = PLAN) {
  await setupRun(cwd, CONFIG);
  await writeFile(join(cwd, "agent.md"), `---\nmodel: ${model}\n---\nResearch.`);
  await writeFile(join(cwd, "plan.md"), plan);
  return { cwd, ui: scriptedUi([]).ui, signal: new AbortController().signal };
}

test("resume rereads agent models for pending steps while retaining completed evidence", async ({
  project,
}) => {
  const input = await setup(project.cwd, "gpt-original");
  const tasks = await loadTasks(project.cwd, "plan.md");
  await expect(
    runWorkflow(input, async ({ task, stage }) => {
      if (task.id === ORCHESTRATOR_ID) return JSON.stringify({ done: false, tasks });
      if (stage.id === "review") throw new StepFailedError("Retry review", "Retry");
      return "Research completed";
    }),
  ).rejects.toThrow();
  await writeFile(join(project.cwd, "agent.md"), "---\nmodel: claude-updated\n---\nResearch.");
  const calls: string[] = [];
  await runWorkflow(input, async ({ task, stage }) => {
    if (task.id === ORCHESTRATOR_ID) return JSON.stringify({ done: true });
    calls.push(`${stage.id}:${stage.executor}/${stage.model}`);
    return "Reviewed";
  });
  expect(calls).toEqual(["review:claude/claude-updated"]);
  const report: RunReport = JSON.parse(
    await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
  );
  expect(report.tasks.find((task) => task.id === "a")?.steps?.map((step) => step.model)).toEqual([
    "gpt-original",
    "claude-updated",
  ]);
});

test("new coordinator tasks resolve agent files and ignore fabricated model assignments", async ({
  project,
}) => {
  const input = await setup(project.cwd, "gpt-specialist", PLAN.replace(/- Agents:.*\n/u, ""));
  const tasks = await loadTasks(project.cwd, "plan.md");
  const followup = {
    ...tasks[0],
    id: "b",
    dependsOn: ["a"],
    agents: { review: "agent.md" },
    agentAssignments: { review: { id: "review", executor: "codex", model: "invented" } },
  };
  let round = 0;
  const seen: string[] = [];
  await runWorkflow(input, async ({ task, stage }) => {
    if (task.id === ORCHESTRATOR_ID) {
      round++;
      return JSON.stringify(
        round === 3
          ? { done: true }
          : { done: false, tasks: round === 1 ? tasks : [...tasks, followup] },
      );
    }
    if (task.id === "b") seen.push(stage.model);
    return "Done";
  });
  expect(seen).toEqual(["planning-model", "gpt-specialist"]);
});
