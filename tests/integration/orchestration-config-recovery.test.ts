import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { readConfigDocument } from "../../src/config/index.js";
import { lockRun, runWorkflow } from "../../src/modules/execution/index.js";
import { prepareOrchestratorPlan } from "../../src/modules/planning/index.js";
import { StepFailedError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun, TASKS } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const input = (cwd: string) => ({
  cwd,
  ui: scriptedUi([]).ui,
  signal: new AbortController().signal,
  tasksPath: "tasks.json",
});
const path = (cwd: string) => join(cwd, ".maestrun/config.json");

test("parallel workers receive the same resolved task configuration as the main project", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { mode: "parallel", concurrency: 2, orchestrator: "plan" },
  });
  await runWorkflow(input(project.cwd), async ({ cwd, task, stage }) => {
    expect(cwd).not.toBe(project.cwd);
    const main = (await readConfigDocument(project.cwd)).document.orchestration;
    expect((await readConfigDocument(cwd)).document.orchestration).toEqual(main);
    expect(main).toMatchObject({
      tasks: expect.arrayContaining([
        expect.objectContaining({
          id: task.id,
          stages: expect.arrayContaining([{ ...stage, effort: stage.effort ?? null }]),
        }),
      ]),
    });
    return "Done";
  });
});

async function failedReview(cwd: string): Promise<void> {
  await setupRun(cwd, {
    ...RUN_CONFIG,
    execution: { mode: "sequential", concurrency: 1, maxRepairs: 0, orchestrator: "plan" },
  });
  const task = {
    ...TASKS[0],
    steps: ["implementation", "review"],
    agents: { implementation: "agent.md", review: "agent.md" },
  };
  await writeFile(join(cwd, "tasks.json"), JSON.stringify({ version: 1, tasks: [task] }));
  await writeFile(join(cwd, "agent.md"), "---\nmodel: gpt-original\neffort: xhigh\n---\nWork.");
  await expect(
    runWorkflow(input(cwd), async ({ stage }) => {
      if (stage.id === "review") throw new StepFailedError("Retry", "Retry");
      return "Done";
    }),
  ).rejects.toThrow();
}

test("resuming refreshes pending profiles without rerunning completed steps", async ({
  project,
}) => {
  await failedReview(project.cwd);
  await writeFile(
    join(project.cwd, "agent.md"),
    "---\nmodel: gpt-updated\neffort: max\n---\nWork.",
  );
  const execute = vi.fn(async ({ stage }) => {
    expect(stage).toMatchObject({ id: "review", model: "gpt-updated", effort: "max" });
    expect((await readConfigDocument(project.cwd)).document.orchestration).toMatchObject({
      tasks: [
        {
          stages: [
            { model: "gpt-updated", effort: "max" },
            { model: "gpt-updated", effort: "max" },
          ],
        },
      ],
    });
    return "Done";
  });
  await runWorkflow(input(project.cwd), execute);
  expect(execute).toHaveBeenCalledTimes(1);
});

test("incomplete and invalid reused plans preserve the last valid snapshot", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
  });
  await runWorkflow(input(project.cwd), async () => "Done");
  const saved = (await readConfigDocument(project.cwd)).document;
  await writeFile(path(project.cwd), JSON.stringify({ ...saved, stages: [RUN_CONFIG.stages[0]] }));
  const previous = await readFile(path(project.cwd), "utf8");
  await writeFile(join(project.cwd, "plan.md"), "### Task a: A\n- Depends on: none\n\nWork.");
  const review = () =>
    prepareOrchestratorPlan({ ...input(project.cwd), ui: scriptedUi([true]).ui });
  await review();
  expect(await readFile(path(project.cwd), "utf8")).toBe(previous);
  await writeFile(
    join(project.cwd, "plan.md"),
    '### Task a: A\n- Depends on: none\n- Steps: review\n- Agents: {"review":"missing.md"}\n\nReview.',
  );
  await expect(review()).rejects.toThrow("Could not open missing.md");
  expect(await readFile(path(project.cwd), "utf8")).toBe(previous);
});

test("ordinary workflows do not write orchestration settings", async ({ project }) => {
  await setupRun(project.cwd);
  const previous = await readFile(path(project.cwd), "utf8");
  await runWorkflow(input(project.cwd), async () => "Done");
  expect(await readFile(path(project.cwd), "utf8")).toBe(previous);
});

test("reusing a plan cannot overwrite settings while another run holds the lock", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await writeFile(join(project.cwd, "plan.md"), "### Task a: A\n- Depends on: none\n\nWork.");
  const previous = await readFile(path(project.cwd), "utf8");
  const release = await lockRun(project.cwd);
  try {
    await expect(
      prepareOrchestratorPlan({ ...input(project.cwd), ui: scriptedUi([true]).ui }),
    ).rejects.toThrow();
    expect(await readFile(path(project.cwd), "utf8")).toBe(previous);
  } finally {
    await release();
  }
});
