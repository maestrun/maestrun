import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { StepInput } from "../../src/contracts/run.js";
import { loadConfig } from "../../src/config/index.js";
import {
  gitOutput,
  loadTasks,
  prepareSample,
  runWorkflow,
  stepResult,
} from "../../src/modules/execution/index.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli } from "../helpers/session-cli.js";
import { runInput, savedReport } from "../helpers/worktrees.js";
import { sampleDirectory, answerSampleApproval } from "../helpers/sample-input.js";
import { test } from "../helpers/project.js";

const ADVANCED_STATUSES = ["failed", "completed", "completed", "completed", "completed"];

test("simple command runs only implementation and tests for two dependent tasks", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project);
  const cli = sessionCli(project.cwd, ["sample"], false);
  const exit = await cli.exited;
  expect(exit, cli.output()).toBe(0);
  expect(cli.output()).toContain("Completed 2/2 tasks.");
  const directory = /Sample project: ([^\r\n]+)/u.exec(cli.output())?.[1];
  if (!directory) throw new Error("Missing sample directory");
  const { config } = await loadConfig(directory);
  expect(config?.stages.map((stage) => stage.id)).toEqual([
    "planning",
    "implementation",
    "testing",
  ]);
  expect(config?.execution?.maxRepairs).toBe(0);
  expect((await loadTasks(directory, "plan.md"))[1]?.dependsOn).toEqual(["simple-greeting"]);
  await expect(stat(join(directory, ".git"))).rejects.toThrow();
  const calls = (await readFile(project.log, "utf8")).trim().split("\n");
  expect(calls).toHaveLength(4);
});

test("advanced command reports an independent failure after completing the remaining tasks", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const originalPath = process.env.PATH;
  await executionProcesses(project, "sample");
  vi.stubEnv("PATH", `${project.bin}:${originalPath}`);
  const cli = sessionCli(project.cwd, ["sample", "advanced"], false);
  const directory = await sampleDirectory(cli);
  await answerSampleApproval(directory);
  const exit = await cli.exited;
  expect(exit, cli.output()).toBe(1);
  expect(cli.output()).toContain("Failed sample-missing-input");
  expect(cli.output()).toContain("sample-required-input.json");
  const { config } = await loadConfig(directory);
  expect(config?.execution).toMatchObject({ mode: "parallel", concurrency: 2, maxRepairs: 1 });
  expect(await gitOutput(directory, ["rev-parse", "--show-toplevel"])).toBe(directory);
  const report = await savedReport(directory);
  expect(report.tasks[0]?.reruns).toHaveLength(1);
  expect(report.tasks[2]?.reruns).toHaveLength(1);
  expect(report.tasks.map((task) => task.status)).toEqual(ADVANCED_STATUSES);
  await expect(stat(join(project.cwd, ".git"))).rejects.toThrow();
});

test("advanced dependencies consume integrated files after the repair", async ({ project }) => {
  await setupRun(project.cwd);
  const before = await readFile(join(project.cwd, ".maestrun/config.json"), "utf8");
  const cwd = await prepareSample(project.cwd, undefined, "advanced");
  expect(await gitOutput(cwd, ["ls-files", "--", "plan.md"])).toBe("");
  expect(await gitOutput(cwd, ["check-ignore", "plan.md"])).toBe("plan.md");
  const paths = new Set<string>();
  const clampStages: string[] = [];
  await expect(
    runWorkflow({ ...runInput(cwd), tasksPath: "plan.md" }, async (input) => {
      paths.add(input.cwd);
      return simulateAdvancedStep(input, clampStages);
    }),
  ).rejects.toThrow("sample-missing-input");
  expect(clampStages).toEqual([
    "implementation",
    "testing",
    "qa",
    "implementation",
    "testing",
    "qa",
    "review",
  ]);
  expect(paths.size).toBe(5);
  expect((await savedReport(cwd)).tasks.map((task) => task.status)).toEqual(ADVANCED_STATUSES);
  expect(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8")).toBe(before);
});

async function simulateAdvancedStep(input: StepInput, clampStages: string[]): Promise<string> {
  if (input.task.id === "sample-missing-input") {
    await expect(readFile(join(input.cwd, "sample-required-input.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    return stepResult(
      JSON.stringify({
        status: "failed",
        summary: "ENOENT: sample-required-input.json is missing",
      }),
    );
  }
  if (input.task.id === "sample-compose") {
    expect(await readFile(join(input.cwd, "sample-add.txt"), "utf8")).toBe("ready");
    expect(await readFile(join(input.cwd, "sample-clamp.txt"), "utf8")).toBe("repaired");
    return "Verified integrated results";
  }
  if (input.task.id === "sample-clamp") clampStages.push(input.stage.id);
  if (input.stage.id === "implementation") {
    if (input.feedback) expect(input.feedback).toContain("Missing upper bound");
    await writeFile(join(input.cwd, `${input.task.id}.txt`), input.feedback ? "repaired" : "ready");
  }
  if (input.task.id === "sample-clamp" && input.stage.id === "qa" && !input.feedback)
    return stepResult(JSON.stringify({ status: "refactor", summary: "Missing upper bound" }));
  return "Verified";
}
