import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { RefactorError } from "../../src/shared/errors.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test("persists completed and needs-changes steps with their individual model and effort", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    ...RUN_CONFIG,
    stages: RUN_CONFIG.stages.map((stage) => ({ ...stage, effort: "high" })),
  });
  await expect(
    runWorkflow(
      {
        cwd: project.cwd,
        ui: scriptedUi([]).ui,
        signal: new AbortController().signal,
        tasksPath: "tasks.json",
      },
      async ({ stage }) => {
        if (stage.id === "testing")
          throw new RefactorError("Needs validation", "Update validation");
        return "Implemented";
      },
    ),
  ).rejects.toThrow();
  const report: unknown = JSON.parse(
    await readFile(join(project.cwd, ".maestrun/run.json"), "utf8"),
  );
  verifyReport(report);
});

function verifyReport(report: unknown): void {
  expect(report).toMatchObject({
    tasks: [
      {
        id: "a",
        status: "refactor",
        model: "qa-test",
        effort: "high",
        steps: [
          { id: "implementation", status: "completed", model: "code-test", effort: "high" },
          { id: "testing", status: "refactor", model: "qa-test", effort: "high" },
        ],
      },
      { id: "b", status: "blocked" },
      { id: "c", status: "refactor" },
    ],
  });
}
