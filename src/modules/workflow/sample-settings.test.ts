import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { selectSampleAssignment } from "./sample-settings.js";
import { prepareSample } from "../execution/index.js";
import { STAGES } from "../../contracts/workflow.js";
import { loadConfig } from "../../config/index.js";
import { BackError } from "../../shared/errors.js";
import { wizardContext } from "../../../tests/helpers/context.js";
import { setupRun, RUN_CONFIG } from "../../../tests/helpers/run.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";
import { test } from "../../../tests/helpers/project.js";

test.for(["high", ""])(
  "sample selection applies effort %j to every stage without changing project settings",
  async (effort, { project }) => {
    await setupRun(project.cwd);
    const before = await readFile(join(project.cwd, ".maestrun/config.json"), "utf8");
    const script = scriptedUi(["codex", "codex-test", effort]);
    const context = wizardContext(project.cwd, script.ui);
    const assignment = await selectSampleAssignment(context, {
      ...context.services,
      models: context.catalog,
    });
    expect(script.calls.find((call) => call.kind === "search")?.initial).toBe(
      RUN_CONFIG.stages[1]?.model,
    );
    expect(assignment).toEqual({
      executor: "codex",
      model: "codex-test",
      ...(effort ? { effort } : {}),
    });
    const directory = await prepareSample(project.cwd, assignment);
    const { config } = await loadConfig(directory);
    expect(config?.stages).toEqual(STAGES.map((id) => ({ id, ...assignment })));
    expect(await readFile(join(project.cwd, ".maestrun/config.json"), "utf8")).toBe(before);
  },
);

test("sample can choose models before project initialization", async ({ project }) => {
  const script = scriptedUi(["codex", "codex-test", "low"]);
  const context = wizardContext(project.cwd, script.ui);
  const assignment = await selectSampleAssignment(context, {
    ...context.services,
    models: context.catalog,
  });
  const directory = await prepareSample(project.cwd, assignment);
  expect((await loadConfig(directory)).config?.stages[1]).toEqual({
    id: "implementation",
    ...assignment,
  });
  expect((await loadConfig(project.cwd)).config).toBeUndefined();
});

test("Back from the first sample setting cancels the sample", async ({ project }) => {
  const context = wizardContext(project.cwd, scriptedUi([new BackError()]).ui);
  await expect(selectSampleAssignment(context, context.services)).rejects.toThrow("Cancelled");
});
