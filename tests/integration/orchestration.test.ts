import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { runWorkflow, ORCHESTRATOR_ID } from "../../src/modules/execution/index.js";
import type { RunReport } from "../../src/contracts/run.js";
import { UserError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun, TASKS } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
function input(cwd: string): Parameters<typeof runWorkflow>[0] {
  return {
    cwd,
    ui: scriptedUi([]).ui,
    signal: new AbortController().signal,
    tasksPath: "tasks.json",
  };
}
async function report(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}
const execution = { mode: "sequential", concurrency: 1, orchestrator: "plan" } as const;
const followup = {
  id: "verify",
  title: "Verify all work",
  instructions: "Verify integration",
  dependsOn: ["b", "c"],
  steps: ["testing"],
};

test("planned orchestration runs each task's own steps and resumes without rerunning", async ({
  project,
}) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, execution });
  const tasks = TASKS.map((task, index) => ({
    ...task,
    steps: index ? ["testing"] : ["implementation"],
    ...(index === 1 ? { parentId: "a" } : {}),
  }));
  await writeFile(join(project.cwd, "tasks.json"), JSON.stringify({ version: 1, tasks }));
  const calls: string[] = [];
  await runWorkflow(input(project.cwd), async ({ task, stage }) => {
    calls.push(`${task.id}:${stage.id}`);
    return "Verified";
  });
  expect(calls).toEqual(["a:implementation", "b:testing", "c:testing"]);
  const saved = await report(project.cwd);
  expect(saved.orchestration?.phase).toBe("complete");
  expect(saved.tasks.map((task) => task.parentId)).toEqual([
    undefined,
    ORCHESTRATOR_ID,
    "a",
    ORCHESTRATOR_ID,
  ]);
  const execute = vi.fn();
  await runWorkflow(input(project.cwd), execute);
  expect(execute).not.toHaveBeenCalled();
});

test("agent creates a plan, adds follow-up work after evidence, and closes the main task", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { ...execution, orchestrator: "agent" },
  });
  const tasks = TASKS.map((task) => ({ ...task, steps: ["implementation"] }));
  let round = 0;
  const calls: string[] = [];
  await runWorkflow(input(project.cwd), async ({ task, stage }) => {
    calls.push(task.id);
    if (task.id !== ORCHESTRATOR_ID) return "Verified";
    expect(stage.model).toBe("codex-test");
    round++;
    if (round === 3) return JSON.stringify({ done: true });
    return JSON.stringify({ done: false, tasks: round === 1 ? tasks : [...tasks, followup] });
  });
  expect(calls.join(",")).toBe(
    `${ORCHESTRATOR_ID},a,b,c,${ORCHESTRATOR_ID},verify,${ORCHESTRATOR_ID}`,
  );
  const saved = await report(project.cwd);
  expect(saved.tasks[0]).toMatchObject({ status: "completed", totalSteps: 3, completedSteps: 3 });
  expect(saved.orchestration).toMatchObject({ round: 3, phase: "complete" });
  const execute = vi.fn();
  await runWorkflow(input(project.cwd), execute);
  expect(execute).not.toHaveBeenCalled();
});

test("managed failures block the main task and resume preserves completed children", async ({
  project,
}) => {
  await setupRun(project.cwd, { ...RUN_CONFIG, execution });
  await expect(
    runWorkflow(input(project.cwd), async ({ task }) => {
      if (task.id === "a") throw new UserError("Unavailable", "Retry");
      return "Done";
    }),
  ).rejects.toThrow("tasks completed");
  expect((await report(project.cwd)).tasks[0]?.status).toBe("blocked");
  const calls: string[] = [];
  await runWorkflow(input(project.cwd), async ({ task }) => {
    calls.push(task.id);
    return "Done";
  });
  expect(calls).toEqual(["a", "a", "b", "b"]);
  expect((await report(project.cwd)).tasks[0]?.status).toBe("completed");
});

test("agent dry-run has no model calls or checkpoint writes", async ({ project }) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { ...execution, orchestrator: "agent" },
  });
  const execute = vi.fn();
  const ui = scriptedUi([]);
  await runWorkflow({ ...input(project.cwd), ui: ui.ui, dryRun: true }, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(ui.messages.join("\n")).toContain("Orchestrator: agent");
  await expect(readFile(join(project.cwd, ".maestrun/run.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test.for(["not json", '{"done":true}', '{"done":false,"tasks":[]}'])(
  "invalid coordinator decision %s stops before children",
  async (decision, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { ...execution, orchestrator: "agent" },
    });
    const execute = vi.fn(async () => decision);
    await expect(runWorkflow(input(project.cwd), execute)).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await report(project.cwd)).tasks[0]?.status).toBe("failed");
  },
);

test("planned orchestration isolates children in parallel worktrees", async ({ project }) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { ...execution, mode: "parallel", concurrency: 2 },
  });
  await runWorkflow(input(project.cwd), async ({ cwd }) => {
    expect(cwd).not.toBe(project.cwd);
    return "Verified";
  });
  const result = await report(project.cwd);
  expect(result.tasks[0]).toMatchObject({ status: "completed" });
  expect(result.tasks[0]?.worktree).toBeUndefined();
  expect(result.tasks.slice(1).every((task) => task.worktree?.integrated)).toBe(true);
});
