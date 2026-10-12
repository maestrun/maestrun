import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { executeStep } from "../../src/modules/execution/index.js";
import type { StepInput } from "../../src/contracts/run.js";
import { test } from "../helpers/project.js";
import { TASKS } from "../helpers/run.js";
import { executionProcesses } from "../helpers/execution-processes.js";

function step(cwd: string, executor: "codex" | "claude"): StepInput {
  const task = TASKS[0];
  if (!task) throw new Error("Missing test task");
  return {
    cwd,
    task,
    stage: { id: "testing", executor, model: "test-model", effort: "high" },
    signal: new AbortController().signal,
    timeoutMs: 5000,
  };
}

test.for([
  ["codex", "testing", "Tests"],
  ["claude", "testing", "Tests"],
  ["codex", "qa", "QA"],
  ["claude", "qa", "QA"],
] as const)(
  "runs %s %s with separate verification instructions",
  async ([executor, id, label], { project }) => {
    await executionProcesses(project);
    const input = step(project.cwd, executor);
    expect(await executeStep({ ...input, stage: { ...input.stage, id } })).toContain("passed");
    const log = await readFile(project.log, "utf8");
    expect(log).toContain(`Run only the ${label} stage`);
    expect(log).toContain(`For ${label}:`);
    expect(log).not.toContain(`For ${id === "qa" ? "Tests" : "QA"}:`);
    expect(log).toContain(
      id === "qa" ? "review the implementation scope" : "unit, integration and/or E2E",
    );
    expect(log).toContain(executor === "codex" ? "workspace-write" : "acceptEdits");
    if (executor === "codex") expect(log).toContain("sandbox_workspace_write.network_access=true");
    expect(log).toContain("test-model");
    expect(log).toContain("high");
    expect(log).toContain("same shell command");
  },
);

test.for(["failed", "malformed", "exit"])(
  "does not report success for %s output",
  async (mode, { project }) => {
    await executionProcesses(project, mode);
    await expect(executeStep(step(project.cwd, "codex"))).rejects.toThrow();
  },
);

test("passes linked custom instructions to the executor", async ({ project }) => {
  await executionProcesses(project);
  await mkdir(join(project.cwd, ".maestrun/steps"), { recursive: true });
  await writeFile(join(project.cwd, ".maestrun/steps/audit.md"), "Inspect accessibility labels");
  const input = step(project.cwd, "codex");
  await executeStep({
    ...input,
    stage: { ...input.stage, id: "custom:Audit", file: ".maestrun/steps/audit.md" },
  });
  expect(await readFile(project.log, "utf8")).toContain("Inspect accessibility labels");
});

test.for(["codex", "claude"] as const)(
  "passes repair evidence to %s",
  async (executor, { project }) => {
    await executionProcesses(project);
    await executeStep({
      ...step(project.cwd, executor),
      feedback: "Testing failed: 9-4 returned -5",
      previousResults: [{ stage: "testing", summary: "node --test: 8 passed, 0 failed" }],
    });
    const log = await readFile(project.log, "utf8");
    expect(log).toContain("Previous failure: Testing failed: 9-4 returned -5");
    expect(log).toContain("Results from completed stages");
    expect(log).toContain("node --test: 8 passed, 0 failed");
    expect(log).toContain("5 automatic repair cycles");
    expect(log).toContain("do not repeat deliberate fault injection");
  },
);

test("timeout stops a running step instead of hanging the workflow", async ({ project }) => {
  await executionProcesses(project, "hang");
  await expect(executeStep({ ...step(project.cwd, "claude"), timeoutMs: 50 })).rejects.toThrow(
    "timed out",
  );
});

test("Claude plugin execution starts an independent print session", async ({ project }) => {
  await executionProcesses(project);
  vi.stubEnv("CLAUDECODE", "parent-session");
  await executeStep(step(project.cwd, "claude"));
  const log = await readFile(project.log, "utf8");
  expect(log).toContain('"parentSession":null');
  expect(log).toContain("--no-session-persistence");
  const { args } = JSON.parse(log.trim()) as { args: string[] };
  expect(JSON.parse(args[args.indexOf("--settings") + 1] ?? "")).toMatchObject({
    sandbox: { network: { allowLocalBinding: true } },
  });
  expect(process.env.CLAUDECODE).toBe("parent-session");
});
