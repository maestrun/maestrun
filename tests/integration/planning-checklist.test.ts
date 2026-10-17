import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createPlan } from "../../src/modules/planning/index.js";
import { loadTasks, runWorkflow, taskChecklist } from "../../src/modules/execution/index.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const TASK = {
  id: "build",
  title: "Build the API",
  instructions: "Implement and verify R1.",
  dependsOn: [],
};
const CONTENT = "### Task build: Build the API\n- Depends on: none\n\nImplement and verify R1.\n";
const input = (cwd: string) => ({
  cwd,
  ui: scriptedUi([]).ui,
  signal: new AbortController().signal,
});
const advanced = (tasks: string) =>
  `<!-- maestrun:prd -->\n# PRD\nR1.\n<!-- maestrun:techspec -->\n# Techspec\nDesign R1.\n<!-- maestrun:tasks -->\n${tasks}`;

test.for(["simple", "advanced", "existing"] as const)(
  "%s plans always have an unchecked task report, updated only by execution",
  async (planMode, { project }) => {
    await setupRun(project.cwd);
    await createPlan(input(project.cwd), {
      wizard: async () => ({
        config: RUN_CONFIG,
        requirements: { text: "Create PRD and techspec", source: "prompt.md" },
        planMode,
      }),
      detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }),
      generate: async () => (planMode === "advanced" ? advanced(CONTENT) : CONTENT),
    });
    const path = join(project.cwd, "plan.md");
    expect(await readFile(path, "utf8")).toContain("- [ ] build: Build the API");
    expect(await loadTasks(project.cwd, "plan.md")).toEqual([TASK]);
    await runWorkflow(input(project.cwd), async () => {
      expect(await readFile(path, "utf8")).toContain("- [ ] build: Build the API");
      return "Verified";
    });
    expect(await readFile(path, "utf8")).toContain("- [x] build: Build the API");
    expect(await loadTasks(project.cwd, "plan.md")).toEqual([TASK]);
    await runWorkflow(input(project.cwd), async () => {
      throw new Error("Must not rerun");
    });
  },
);

test.for(["simple", "advanced"] as const)(
  "%s rejects documents without runnable tasks and preserves the previous plan",
  async (planMode, { project }) => {
    await setupRun(project.cwd);
    await writeFile(join(project.cwd, "plan.md"), "User plan");
    await expect(
      createPlan(input(project.cwd), {
        wizard: async () => ({
          config: RUN_CONFIG,
          requirements: { text: "Create docs", source: "prompt.md" },
          planMode,
        }),
        detect: async () => ({ id: "codex", state: "ready", detail: "Ready", nextAction: "" }),
        generate: async () =>
          planMode === "advanced" ? advanced("# Tasks\nNo tasks.") : "# PRD\nRequirements only.",
      }),
    ).rejects.toThrow("expected Markdown task sections");
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("User plan");
  },
);

test("generated checklist is idempotent, escapes titles and leaves fenced examples intact", () => {
  const example =
    "```md\n<!-- maestrun:checklist -->\nexample\n<!-- /maestrun:checklist -->\n```\n";
  const tasks = [{ ...TASK, title: "Inspect [x] <script>" }];
  const generated = taskChecklist(example + CONTENT, tasks);
  expect(generated).toContain(example);
  expect(generated).toContain("- [ ] build: Inspect \\[x\\] \\<script\\>");
  expect(taskChecklist(generated, tasks)).toBe(generated);
});
