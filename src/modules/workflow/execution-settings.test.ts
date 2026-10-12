import { expect } from "vitest";
import { parseConfig } from "../../config/index.js";
import { BackError, CancelError } from "../../shared/errors.js";
import { selectExecution } from "./execution-step.js";
import { runWizard } from "./configure-workflow.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";

test.for([
  { execution: { mode: "batch" } },
  { execution: { mode: null } },
  { execution: { mode: "parallel", concurrency: 0 } },
  { execution: { mode: "parallel", concurrency: 17 } },
  { execution: { mode: "parallel", background: "true" } },
  { timeoutMs: -1 },
  { timeoutMs: 86400001 },
  { timeoutMs: "1000" },
  { plugins: ["https://example.com/a.js"] },
  { plugins: ["../../../tests/a.js", "../../../tests/a.js"] },
  { plugins: [4] },
  { execution: false },
])("rejects invalid behavior settings: %j", (options) => {
  expect(() => parseConfig({ ...CONFIG, ...options })).toThrow("Invalid configuration field");
});

test("legacy configs retain their shape and optional settings round-trip", () => {
  expect(parseConfig(CONFIG)).toEqual(CONFIG);
  const options = {
    execution: { mode: "parallel", concurrency: 3, background: true },
    timeoutMs: 5000,
    plugins: ["./extension.mjs"],
  };
  expect(parseConfig({ ...CONFIG, ...options })).toEqual({ ...CONFIG, ...options });
  expect(parseConfig({ ...CONFIG, execution: { mode: "parallel" } }).execution?.concurrency).toBe(
    2,
  );
  expect(parseConfig({ ...CONFIG, execution: { background: true } }).execution).toEqual({
    mode: "sequential",
    concurrency: 2,
    background: true,
  });
});

test("execution selection preserves other behavior settings", async () => {
  const script = scriptedUi(["parallel"]);
  const config = {
    ...CONFIG,
    timeoutMs: 9000,
    execution: { mode: "sequential" as const, concurrency: 4, background: false },
  };
  expect(await selectExecution(script.ui, config)).toEqual({
    ...config,
    execution: { mode: "parallel", concurrency: 4, background: false },
  });
  await expect(selectExecution(scriptedUi(["wrong"]).ui, CONFIG)).rejects.toThrow(
    "Invalid execution",
  );
});

test.for([undefined, CONFIG])(
  "Escape exits the first menu with saved=%j",
  async (saved, { project }) => {
    const script = scriptedUi([new BackError()]);
    const context = wizardContext(project.cwd, script.ui);
    await expect(runWizard({ ...context, saved }, context.services)).rejects.toThrow(CancelError);
    expect(script.calls).toHaveLength(1);
  },
);

test("Back from execution returns to advanced mode and preserves custom options", async ({
  project,
}) => {
  const script = scriptedUi([
    "adjust",
    [],
    "codex",
    "codex-test",
    "",
    false,
    new BackError(),
    false,
    "parallel",
  ]);
  const context = wizardContext(project.cwd, script.ui);
  const saved = { ...CONFIG, timeoutMs: 3000, plugins: ["./trusted.mjs"] };
  const result = await runWizard(
    { ...context, saved },
    { ...context.services, models: context.catalog },
  );
  expect(result.config).toEqual({ ...saved, execution: { mode: "parallel", concurrency: 2 } });
  expect(script.calls.filter((call) => call.message.startsWith("Advanced mode"))).toHaveLength(2);
});
