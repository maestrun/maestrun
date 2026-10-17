import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { Draft } from "../../src/contracts/workflow.js";
import { loadConfig } from "../../src/config/index.js";
import {
  createPlan,
  planningPrompt,
  prepareOrchestratorPlan,
} from "../../src/modules/planning/index.js";
import { loadTasks, runWorkflow } from "../../src/modules/execution/index.js";
import { CONFIG } from "../helpers/context.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const DRAFT: Draft = {
  config: { ...CONFIG, execution: { mode: "sequential", concurrency: 1, orchestrator: "agent" } },
  requirements: { text: "Research a topic and prepare a report.", source: "prompt.md" },
};
const READY = { id: "codex", state: "ready", detail: "Ready", nextAction: "" } as const;
const PLAN = `## Tasks
### Task research: Research sources
- Depends on: none
- Steps: custom:Research, custom:Summarize

Gather reliable sources, then summarize their evidence.

### Task report: Write the report
- Depends on: research
- Steps: custom:Write, custom:Fact check

Write a report and check every claim against the collected sources.
`;

test("generation defines and previews task-specific steps without adding global stages", async ({
  project,
}) => {
  await setupRun(project.cwd, DRAFT.config);
  const script = scriptedUi([]);
  const input = { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal };
  await createPlan(input, {
    wizard: async () => DRAFT,
    detect: async () => READY,
    generate: async () => PLAN,
  });
  expect((await loadConfig(project.cwd)).config).toEqual(DRAFT.config);
  expect((await loadTasks(project.cwd, "plan.md")).map((task) => task.steps)).toEqual([
    ["custom:Research", "custom:Summarize"],
    ["custom:Write", "custom:Fact check"],
  ]);
  expect(script.messages.join("\n")).toContain("Final plan review — task steps");
  expect(script.messages.join("\n")).toContain("Fact check — Codex / codex-test");
  const execute = vi.fn();
  await writeFile(join(project.cwd, "plan.md"), PLAN.replace("custom:Summarize", "custom:Compare"));
  await runWorkflow({ ...input, dryRun: true }, execute);
  expect(script.messages.join("\n")).toContain("custom:Compare: codex/codex-test");
  expect(execute).not.toHaveBeenCalled();
  await expect(readFile(join(project.cwd, ".maestrun/run.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test.for(["", "- Steps: planning\n", "- Steps: custom:Research, custom:Research\n"])(
  "invalid generated steps preserve the previous plan: %s",
  async (steps, { project }) => {
    await setupRun(project.cwd, DRAFT.config);
    const path = join(project.cwd, "plan.md");
    await writeFile(path, PLAN);
    const script = scriptedUi([]);
    await expect(
      createPlan(
        { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal },
        {
          wizard: async () => DRAFT,
          detect: async () => READY,
          generate: async () =>
            `### Task research: Research\n- Depends on: none\n${steps}\nGather sources.`,
        },
      ),
    ).rejects.toThrow(/Steps metadata|unique execution step ids/u);
    expect(await readFile(path, "utf8")).toBe(PLAN);
    expect(script.messages.join("\n")).not.toContain("Final plan review");
  },
);

test("orchestrated planning instructs the model to create steps suitable for non-coding tasks", () => {
  const prompt = planningPrompt(DRAFT);
  expect(prompt).toContain("research, analysis, writing");
  expect(prompt).toContain("Every task must declare a nonempty Steps list");
  expect(prompt).toContain("Custom steps do not need to be registered in config.json");
  expect(prompt).toContain("Backend-only work does not need a frontend test step");
  expect(prompt).toContain("documentation-only work does not need backend or frontend test steps");
  expect(prompt).toContain("Do not add requirements for workers to prove their own model identity");
  expect(prompt).not.toContain("respect the configured order");
  expect(planningPrompt({ ...DRAFT, config: CONFIG })).toContain("respect the configured order");
});

test("an older plan without steps stays editable during final review", async ({ project }) => {
  await setupRun(project.cwd, DRAFT.config);
  const plan = "### Task research: Research\n- Depends on: none\n\nGather sources.";
  await writeFile(join(project.cwd, "plan.md"), plan);
  const script = scriptedUi([true]);
  const input = { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal };
  await prepareOrchestratorPlan(input);
  expect(script.messages.join("\n")).toContain("Steps not defined");
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe(plan);
  const execute = vi.fn();
  await expect(runWorkflow({ ...input, dryRun: true }, execute)).rejects.toThrow(
    "needs Steps metadata",
  );
  expect(execute).not.toHaveBeenCalled();
});
