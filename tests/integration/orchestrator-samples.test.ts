import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { DEFAULT_STAGES } from "../../src/contracts/workflow.js";
import { loadConfig } from "../../src/config/index.js";
import {
  loadTasks,
  prepareSample,
  runWorkflow,
  ORCHESTRATOR_ID,
} from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { sessionCli } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test.for(["plan", "agent"] as const)(
  "%s sample keeps the workflow small and preserves project settings",
  async (strategy, { project }) => {
    await setupRun(project.cwd);
    const before = await readFile(join(project.cwd, ".maestrun/config.json"), "utf8");
    const cwd = await prepareSample(project.cwd, undefined, `orchestrator-${strategy}`);
    const { config } = await loadConfig(cwd);
    expect(config?.execution).toMatchObject({
      orchestrator: strategy,
      mode: "sequential",
      maxRepairs: 0,
    });
    expect(config?.stages.map((stage) => stage.id)).toEqual([...DEFAULT_STAGES, "review"]);
    const tasks = await loadTasks(cwd, "plan.md");
    expect(tasks).toHaveLength(strategy === "plan" ? 6 : 1);
    const plan =
      strategy === "plan"
        ? tasks
        : await loadTasks(
            await prepareSample(project.cwd, undefined, "orchestrator-plan"),
            "plan.md",
          );
    const calls = await executeSample(cwd, plan);
    expect(calls).toHaveLength(strategy === "plan" ? 11 : 13);
    for (const call of ["add:review", "clamp:review", "score:testing", "score:review"])
      expect(calls).toContain(call);
    expect((await savedReport(cwd)).tasks.every((task) => task.status === "completed")).toBe(true);
    expect(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8")).toBe(before);
  },
);

test("both orchestrator examples are discoverable through sample help", async ({ project }) => {
  const cli = sessionCli(project.cwd, ["sample", "--help"], false);
  expect(await cli.exited).toBe(0);
  expect(cli.output()).toContain("orchestrator-plan");
  expect(cli.output()).toContain("orchestrator-agent");
});

async function executeSample(
  cwd: string,
  plan: Awaited<ReturnType<typeof loadTasks>>,
): Promise<string[]> {
  const calls: string[] = [];
  await runWorkflow({ ...runInput(cwd), tasksPath: "plan.md" }, async ({ task, stage }) => {
    calls.push(`${task.id}:${stage.id}`);
    if (task.id !== ORCHESTRATOR_ID) return "Verified";
    return JSON.stringify(
      stage.id === "custom:Coordinate 1" ? { done: false, tasks: plan } : { done: true },
    );
  });
  return calls;
}

test("sample review instructions permit reading without depending on unavailable test evidence", async ({
  project,
}) => {
  await setupRun(project.cwd);
  for (const strategy of ["plan", "agent"] as const) {
    const cwd = await prepareSample(project.cwd, undefined, `orchestrator-${strategy}`);
    const tasks = await loadTasks(cwd, "plan.md");
    const reviews =
      strategy === "agent" ? tasks : tasks.filter((task) => task.steps?.includes("review"));
    for (const task of reviews) {
      expect(task.instructions).toContain("read-only command");
      expect(task.instructions).not.toMatch(/no commands|reuse (prior )?test evidence/iu);
    }
  }
});
