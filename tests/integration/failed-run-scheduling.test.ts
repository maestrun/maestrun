import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { runWorkflow, stepResult } from "../../src/modules/execution/index.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test.for(["sequential", "parallel"] as const)(
  "%s continues independent tasks after repairs are exhausted",
  async (mode, { project }) => {
    await setupRun(project.cwd, {
      ...RUN_CONFIG,
      execution: { mode, concurrency: 2, maxRepairs: 1 },
    });
    const calls: string[] = [];
    const input = {
      cwd: project.cwd,
      tasksPath: "tasks.json",
      signal: new AbortController().signal,
      ui: scriptedUi([]).ui,
    };
    await expect(
      runWorkflow(input, async ({ task }) => {
        calls.push(task.id);
        return task.id === "a"
          ? stepResult('{"status":"failed","summary":"Still broken"}')
          : "Verified";
      }),
    ).rejects.toThrow("1/3 tasks completed");
    expect(calls.filter((id) => id === "a")).toHaveLength(2);
    expect(calls).not.toContain("b");
    expect(calls.filter((id) => id === "c")).toHaveLength(2);
    const report = JSON.parse(await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"));
    expect(report.tasks).toMatchObject([
      { status: "failed" },
      { status: "blocked" },
      { status: "completed" },
    ]);
  },
);
