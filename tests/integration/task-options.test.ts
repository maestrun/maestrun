import { expect, test } from "vitest";
import { parseTaskDocument, parseTasks, taskStages } from "../../src/modules/execution/index.js";
import { parseConfig } from "../../src/config/index.js";
import { selectExecution } from "../../src/modules/workflow/execution-step.js";
import { RUN_CONFIG, TASKS } from "../helpers/run.js";
import { scriptedUi } from "../helpers/ui.js";

test.for([[], ["planning"], ["testing", "testing"], ["unknown"], "testing"])(
  "rejects invalid task steps %j",
  (steps) => {
    expect(() => parseTasks({ version: 1, tasks: [{ ...TASKS[0], steps }] })).toThrow(
      "unique execution step ids",
    );
  },
);

test.for(["missing", "a", "", 42])("rejects invalid parent %j", (parentId) => {
  expect(() => parseTasks({ version: 1, tasks: [{ ...TASKS[0], parentId }] })).toThrow(
    "Invalid task plan",
  );
});

test("rejects parent cycles independently of execution dependencies", () => {
  const tasks = [
    { ...TASKS[0], parentId: "b" },
    { ...TASKS[1], parentId: "a" },
  ];
  expect(() => parseTasks({ version: 1, tasks })).toThrow("cyclic task parent");
});

test("Markdown metadata selects steps in task order and keeps parent out of instructions", () => {
  const tasks = parseTaskDocument(`### Task a: Main
- Depends on: none
- Steps: testing, implementation

Verify then implement.

### Task b: Child
- Depends on: a
- Parent: a
- Steps: testing

Verify child.
`);
  const [main, child] = tasks;
  if (!main || !child) throw new Error("Missing parsed tasks");
  expect(tasks[1]).toMatchObject({
    parentId: "a",
    steps: ["testing"],
    instructions: "Verify child.",
  });
  expect(taskStages(RUN_CONFIG, main).map((stage) => stage.id)).toEqual([
    "testing",
    "implementation",
  ]);
  expect(() => taskStages(RUN_CONFIG, { ...child, steps: ["qa"] })).toThrow("unconfigured step qa");
});

test.for(["plan", "agent"] as const)(
  "selects %s orchestration with independent parallel settings",
  async (strategy) => {
    const ui = scriptedUi([strategy, "parallel"]);
    const config = await selectExecution(ui.ui, RUN_CONFIG);
    expect(config.execution).toMatchObject({ mode: "parallel", orchestrator: strategy });
    expect(parseConfig(config).execution?.orchestrator).toBe(strategy);
    const regular = await selectExecution(scriptedUi(["sequential"]).ui, config);
    expect(regular.execution?.orchestrator).toBeUndefined();
  },
);

test.for([false, "dynamic", 1])("rejects invalid orchestrator setting %j", (orchestrator) => {
  expect(() => parseConfig({ ...RUN_CONFIG, execution: { orchestrator } })).toThrow(
    "execution.orchestrator",
  );
});

test("configured assignments override defaults, and regular workflows still reject unconfigured steps", () => {
  const config = {
    ...RUN_CONFIG,
    stages: RUN_CONFIG.stages.slice(0, 1),
    execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
  } as const;
  const task = {
    id: "report",
    title: "Report",
    dependsOn: [],
    instructions: "Write a report.",
    steps: ["custom:Write report", "review"] as const,
  };
  const assigned = {
    ...config,
    stages: [
      ...config.stages,
      { id: "review", executor: "claude", model: "review-model" } as const,
    ],
  };
  expect(taskStages(assigned, task).map((stage) => stage.model)).toEqual([
    "codex-test",
    "review-model",
  ]);
  expect(() => taskStages(RUN_CONFIG, task)).toThrow("unconfigured step");
  for (const task of TASKS) expect(() => taskStages(config, task)).toThrow("needs Steps metadata");
  expect(() => taskStages(config, { ...task, steps: ["planning"] })).toThrow("unconfigured step");
});
