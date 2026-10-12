import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { STAGES } from "../../src/contracts/workflow.js";
import { loadTasks, prepareSample } from "../../src/modules/execution/index.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { sessionCli, stopSession } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

test("sample creation preserves project settings and fills in the built-in workflow", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: [...RUN_CONFIG.stages, { id: "custom:PR", executor: "codex", model: "pr-model" }],
    plugins: ["./user-plugin.mjs"],
    execution: { mode: "parallel", concurrency: 3, background: true },
    timeoutMs: 12345,
  });
  const before = await readFile(join(project.cwd, ".maestrun/config.json"), "utf8");
  const directory = await prepareSample(project.cwd);
  const { config } = await loadConfig(directory);
  expect(config?.stages.map((stage) => stage.id)).toEqual(STAGES);
  expect(config?.stages[1]).toEqual(RUN_CONFIG.stages[1]);
  expect(config?.stages[2]).toEqual(RUN_CONFIG.stages[2]);
  expect(config?.stages[3]).toEqual({ ...RUN_CONFIG.stages[0], id: "qa" });
  expect(config?.execution).toEqual({ mode: "sequential", concurrency: 1, background: false });
  expect(config?.timeoutMs).toBe(12345);
  expect(config?.plugins).toBeUndefined();
  expect(await loadTasks(directory, "plan.md")).toHaveLength(3);
  expect(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8")).toBe(before);
});

test("sample requires configured models before creating files", async ({ project }) => {
  await expect(prepareSample(project.cwd)).rejects.toThrow("No saved workflow");
  await expect(readdir(join(project.cwd, ".maestrun/samples"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("sample run starts fresh on every invocation and preserves the main checkpoint", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "sample");
  const checkpoint = join(project.cwd, ".maestrun/run.json");
  await writeFile(checkpoint, "existing project checkpoint");
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const cli = sessionCli(project.cwd, ["sample", "run"], false);
    expect(await cli.exited).toBe(0);
    expect(cli.output()).toContain("Completed 3/3 tasks.");
  }
  expect(await readdir(join(project.cwd, ".maestrun/samples"))).toHaveLength(2);
  expect(await readFile(checkpoint, "utf8")).toBe("existing project checkpoint");
  const calls = (await readFile(project.log, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { input: string });
  const stages = ["Implementation", "Tests", "QA", "Review"];
  const expected = [...stages, ...stages.slice(0, 3), ...stages, ...stages];
  expect(calls.map((call) => /^Run only the (.*?) stage/u.exec(call.input)?.[1])).toEqual([
    ...expected,
    ...expected,
  ]);
  expect(calls[7]?.input).toContain("Previous failure: Automatic repair (1/5) after qa");
});

test("sample run exposes the repair in the terminal and stays open for navigation", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "sample");
  const cli = sessionCli(project.cwd, ["sample", "run"]);
  let directory: string | undefined;
  try {
    await chooseSampleModel(cli);
    await cli.wait("task command center");
    directory = /Sample project: ([^\r\n]+)/u.exec(cli.output())?.[1];
    const { config } = await loadConfig(directory ?? "");
    expect(
      config?.stages.every((stage) => stage.model === "sample-model" && stage.effort === "high"),
    ).toBe(true);
    cli.send("\x1b[B");
    await cli.wait("Automatic repair (1/5) after qa");
    await cli.wait("Esc close");
    cli.send("\r");
    await cli.wait("Task details");
    cli.send("\r");
    cli.send("\x1b");
    expect(await cli.exited).toBe(0);
  } finally {
    cli.kill();
    if (directory) await stopSession(directory);
  }
});

async function chooseSampleModel(cli: ReturnType<typeof sessionCli>): Promise<void> {
  await cli.wait("Executor");
  cli.send("\r");
  await cli.wait("Codex model (type to search)");
  cli.send("\x1b[B\r");
  await cli.wait("Codex effort");
  cli.send("\x1b[B\x1b[B\r");
}

test("cancelling sample model selection starts no tasks and creates no sample", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await executionProcesses(project, "sample");
  const cli = sessionCli(project.cwd, ["sample", "run"]);
  try {
    await cli.wait("Executor");
    cli.send("\r");
    await cli.wait("Codex model (type to search)");
    cli.send("\x03");
    expect(await cli.exited).toBe(130);
    await expect(readdir(join(project.cwd, ".maestrun/samples"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(project.log)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    cli.kill();
  }
});
