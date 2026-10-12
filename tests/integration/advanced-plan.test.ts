import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { saveConfig } from "../../src/config/index.js";
import {
  createPlan,
  planningPrompt,
  runPlanWizard,
  saveAdvancedPlan,
} from "../../src/modules/planning/index.js";
import { loadTasks } from "../../src/modules/execution/index.js";
import { CONFIG, DRAFT, wizardContext } from "../helpers/context.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const TASK = {
  id: "checkout",
  title: "Build checkout",
  instructions: "Implement R1 and verify checkout",
  dependsOn: [],
};
const MANIFEST = `### Task checkout: Build checkout\n\n- Depends on: none\n\n${TASK.instructions}`;
const CONTENT = `<!-- maestrun:prd -->\n# PRD\nR1: Checkout works.\n<!-- maestrun:techspec -->\n# TechSpec\nImplement R1 using existing routes.\n<!-- maestrun:tasks -->\n# Tasks\nVerify R1.\n${MANIFEST}`;
const READY = { id: "codex", state: "ready", detail: "Ready", nextAction: "" } as const;

async function checkDocuments(cwd: string, folder: string): Promise<void> {
  expect(await readdir(join(cwd, folder))).toEqual(["prd.md", "tasks.md", "techspec.md"]);
  expect(await readFile(join(cwd, folder, "prd.md"), "utf8")).toBe("# PRD\nR1: Checkout works.\n");
  expect(await readFile(join(cwd, folder, "techspec.md"), "utf8")).toContain("Implement R1");
  expect(await readFile(join(cwd, "plan.md"), "utf8")).toContain(
    `${encodeURIComponent(folder)}/prd.md`,
  );
  expect(await loadTasks(cwd, "plan.md")).toEqual([TASK]);
  expect(await loadTasks(cwd, `${folder}/tasks.md`)).toEqual([TASK]);
}

test.for(["tasks", "Checkout #1"])(
  "writes advanced documents in %s and a runnable root plan",
  async (folder, { project }) => {
    await rm(join(project.cwd, "requirements.md"));
    await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
    const script = scriptedUi(["paste", "Build checkout", "advanced", folder, true]);
    await createPlan(wizardContext(project.cwd, script.ui), {
      wizard: runPlanWizard,
      detect: async () => READY,
      generate: async ({ draft }) => {
        expect(planningPrompt(draft)).toContain("<!-- maestrun:prd -->");
        return CONTENT;
      },
    });
    await checkDocuments(project.cwd, folder);
    expect(script.remaining()).toBe(0);
  },
);

test.for(["missing-doc", "empty-doc", "missing-metadata", "bad-dependency", "duplicate-manifest"])(
  "rejects %s before creating advanced files",
  async (mode, { project }) => {
    const outputs: Record<string, string> = {
      "missing-doc": "# Ordinary plan",
      "empty-doc": CONTENT.replace("# PRD\nR1: Checkout works.", ""),
      "missing-metadata": CONTENT.replace("- Depends on: none", ""),
      "bad-dependency": CONTENT.replace("- Depends on: none", "- Depends on: missing"),
      "duplicate-manifest": `${CONTENT}\n${MANIFEST}`,
    };
    await expect(
      saveAdvancedPlan(
        wizardContext(project.cwd, scriptedUi([]).ui),
        { ...DRAFT, planMode: "advanced" },
        outputs[mode] ?? "",
      ),
    ).rejects.toThrow();
    expect(await readdir(project.cwd)).not.toContain("tasks");
  },
);

test("advanced saving preserves existing directories and their files", async ({ project }) => {
  await mkdir(join(project.cwd, "tasks"));
  await writeFile(join(project.cwd, "tasks", "prd.md"), "User PRD");
  await expect(
    saveAdvancedPlan(wizardContext(project.cwd, scriptedUi([]).ui), DRAFT, CONTENT),
  ).rejects.toThrow("already exists");
  expect(await readFile(join(project.cwd, "tasks", "prd.md"), "utf8")).toBe("User PRD");
});

test("cancelling advanced generation preserves the previous plan and creates no folder", async ({
  project,
}) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  await writeFile(join(project.cwd, "plan.md"), "Previous plan");
  const controller = new AbortController();
  await expect(
    createPlan(
      { ...wizardContext(project.cwd, scriptedUi([]).ui), signal: controller.signal },
      {
        wizard: async () => ({ ...DRAFT, planMode: "advanced" }),
        detect: async () => READY,
        generate: async () => {
          controller.abort();
          return CONTENT;
        },
      },
    ),
  ).rejects.toThrow("Cancelled");
  expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("Previous plan");
  expect(await readdir(project.cwd)).not.toContain("tasks");
});

test("existing files guide planning without the advanced output format", () => {
  const prompt = planningPrompt({
    ...DRAFT,
    planMode: "existing",
    requirements: { source: "docs/my-idea.md", text: "Keep the user's architecture" },
  });
  expect(prompt).toContain("source of truth: docs/my-idea.md");
  expect(prompt).toContain("Keep the user's architecture");
  expect(prompt).toContain("Preserve source files");
  expect(prompt).not.toContain("<!-- maestrun:prd -->");
});

test("root plan reads edits directly from advanced Markdown tasks", async ({ project }) => {
  const root = await saveAdvancedPlan(
    wizardContext(project.cwd, scriptedUi([]).ui),
    DRAFT,
    CONTENT,
  );
  await writeFile(join(project.cwd, "plan.md"), root);
  expect(root).not.toContain("### Task");
  await writeFile(
    join(project.cwd, "tasks/tasks.md"),
    MANIFEST.replace(TASK.instructions, "Updated scope"),
  );
  expect(await loadTasks(project.cwd, "plan.md")).toEqual([
    { ...TASK, instructions: "Updated scope" },
  ]);
  expect(planningPrompt(DRAFT)).toContain("Write runnable tasks directly in Markdown");
});
