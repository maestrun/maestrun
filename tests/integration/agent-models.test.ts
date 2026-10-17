import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import type { Config } from "../../src/contracts/workflow.js";
import {
  loadTasks,
  ORCHESTRATOR_ID,
  runWorkflow,
  stepPrompt,
} from "../../src/modules/execution/index.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CONFIG: Config = {
  version: 1,
  stages: [
    { id: "planning", executor: "codex", model: "planning-model", effort: "ultra" },
    { id: "implementation", executor: "codex", model: "stage-model" },
  ],
  targets: {
    frontend: { executor: "codex", model: "target-model" },
    backend: { executor: "codex", model: "backend-model" },
  },
  execution: { mode: "sequential", concurrency: 1, orchestrator: "plan" },
};
const PLAN = `### Task research: Research
- Depends on: none
- Steps: custom:Research, implementation, review
- Target: frontend
- Agents: {"custom:Research":".claude/agents/research.md","implementation":"team definitions/writer.md"}

Research and implement a report, then review it.
`;

async function setup(cwd: string, config = CONFIG): Promise<void> {
  await mkdir(join(cwd, ".claude/agents"), { recursive: true });
  await mkdir(join(cwd, "team definitions"), { recursive: true });
  await writeFile(
    join(cwd, ".claude/agents/research.md"),
    "---\nmodel: claude-research\neffort: high\n---\nUse primary sources.",
  );
  await writeFile(
    join(cwd, "team definitions/writer.md"),
    '---\nmodel: "gpt-writer"\n---\nWrite concise reports.',
  );
  await writeFile(join(cwd, "plan.md"), PLAN);
  await setupRun(cwd, config);
}

test.for(["plan", "agent"] as const)(
  "%s prioritizes agent files in any directory, previews and resumes",
  async (orchestrator, { project }) => {
    await setup(project.cwd, {
      ...CONFIG,
      execution: { mode: "sequential", concurrency: 1, orchestrator },
    });
    const script = scriptedUi([]);
    const input = { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal };
    await runWorkflow({ ...input, dryRun: true }, vi.fn());
    expect(script.messages.join("\n")).toContain(
      "custom:Research: claude/claude-research → implementation: codex/gpt-writer → review: codex/planning-model",
    );
    const tasks = await loadTasks(project.cwd, "plan.md");
    let round = 0;
    const calls: string[] = [];
    await runWorkflow(input, async (step) => {
      if (step.task.id === ORCHESTRATOR_ID) {
        expect(step.stage.model).toBe("planning-model");
        return JSON.stringify(++round === 1 ? { done: false, tasks } : { done: true });
      }
      calls.push(step.stage.model);
      const prompt = await stepPrompt(step);
      if (step.stage.id === "custom:Research") expect(prompt).toContain("Use primary sources.");
      if (step.stage.id === "implementation") expect(prompt).toContain("Write concise reports.");
      return "Done";
    });
    expect(calls).toEqual(["claude-research", "gpt-writer", "planning-model"]);
    const execute = vi.fn();
    await runWorkflow(input, execute);
    expect(execute).not.toHaveBeenCalled();
  },
);

test("parallel tasks keep different models for the same stage", async ({ project }) => {
  await setup(project.cwd, {
    ...CONFIG,
    execution: { mode: "parallel", concurrency: 2, orchestrator: "plan" },
  });
  await writeFile(
    join(project.cwd, "plan.md"),
    PLAN +
      PLAN.replace("Task research:", "Task second:").replace(
        "team definitions/writer.md",
        ".claude/agents/research.md",
      ),
  );
  const seen: Record<string, string> = {};
  await runWorkflow(
    { cwd: project.cwd, ui: scriptedUi([]).ui, signal: new AbortController().signal },
    async (step) => {
      if (step.stage.id === "implementation") seen[step.task.id] = step.stage.model;
      expect(await stepPrompt(step)).toContain(
        step.stage.id === "review"
          ? "Research and implement"
          : step.stage.id === "implementation" && step.task.id === "research"
            ? "Write concise reports"
            : "Use primary sources",
      );
      return "Done";
    },
  );
  expect(seen).toEqual({ research: "gpt-writer", second: "claude-research" });
});

test("planning reviews models from files and rejects missing agents before replacing the plan", async ({
  project,
}) => {
  await setup(project.cwd);
  const script = scriptedUi([]);
  const input = { cwd: project.cwd, ui: script.ui, signal: new AbortController().signal };
  const services = {
    wizard: async () => ({
      config: CONFIG,
      requirements: { text: "Research", source: "prompt.md" },
    }),
    detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }) as const,
    generate: async () => PLAN,
  };
  await createPlan(input, services);
  expect(script.messages.join("\n")).toContain(
    "Research — Claude Code / claude-research / effort: high",
  );
  const saved = await readFile(join(project.cwd, "plan.md"), "utf8");
  await expect(
    createPlan(input, {
      ...services,
      generate: async () => PLAN.replace("writer.md", "missing.md"),
    }),
  ).rejects.toThrow("Could not open missing.md");
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe(saved);
});
