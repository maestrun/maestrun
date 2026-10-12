import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import {
  discoverGuidance,
  loadGuidance,
  renderGuidance,
} from "../../src/modules/planning/index.js";
import {
  installGuidance,
  SKILL_PATH,
  SKILL_TEXT,
  RULE_PATH,
  RULE_TEXT,
} from "../helpers/guidance.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";
import { wizardContext } from "../helpers/context.js";

test("discovers project skills, rules and AGENTS.md without listing references as skills", async ({
  project,
}) => {
  await installGuidance(project.cwd);
  await writeFile(join(project.cwd, ".agents/skills/verify/reference.md"), "Reference");
  expect(await discoverGuidance(project.cwd)).toEqual({
    skills: [SKILL_PATH],
    rules: ["AGENTS.md", RULE_PATH],
  });
});

test("automatically reads every discovered project skill and rule without prompting", async ({
  project,
}) => {
  await installGuidance(project.cwd);
  const script = scriptedUi([]);
  const guidance = await loadGuidance(wizardContext(project.cwd, script.ui));
  expect(guidance).toEqual({
    skills: [{ path: SKILL_PATH, content: SKILL_TEXT }],
    rules: [
      { path: "AGENTS.md", content: "# Project rules\nPreserve user changes." },
      { path: RULE_PATH, content: RULE_TEXT },
    ],
  });
  expect(script.calls).toEqual([]);
});

test("loads project Codex and Claude skills and rules as well as root instructions", async ({
  project,
}) => {
  for (const root of [".codex", ".claude"]) {
    await mkdir(join(project.cwd, root, "skills/example"), { recursive: true });
    await mkdir(join(project.cwd, root, "rules"), { recursive: true });
    await writeFile(join(project.cwd, root, "skills/example/SKILL.md"), "# Example");
    await writeFile(join(project.cwd, root, "rules/project.md"), "# Rules");
  }
  await writeFile(join(project.cwd, "CLAUDE.md"), "Project instructions");
  const guidance = await loadGuidance(wizardContext(project.cwd, scriptedUi([]).ui));
  expect(guidance.skills.map((file) => file.path)).toEqual([
    ".claude/skills/example/SKILL.md",
    ".codex/skills/example/SKILL.md",
  ]);
  expect(guidance.rules.map((file) => file.path)).toEqual([
    "CLAUDE.md",
    ".claude/rules/project.md",
    ".codex/rules/project.md",
  ]);
});

test("projects without guidance continue without prompts", async ({ project }) => {
  const script = scriptedUi([]);
  expect(await loadGuidance(wizardContext(project.cwd, script.ui))).toEqual({
    skills: [],
    rules: [],
  });
  expect(script.calls).toEqual([]);
});

test("loads Copilot project skills and instructions", async ({ project }) => {
  await mkdir(join(project.cwd, ".github/skills/example"), { recursive: true });
  await mkdir(join(project.cwd, ".github/instructions"), { recursive: true });
  await writeFile(join(project.cwd, ".github/skills/example/SKILL.md"), "# Skill");
  await writeFile(join(project.cwd, ".github/copilot-instructions.md"), "# Project");
  await writeFile(join(project.cwd, ".github/instructions/tests.instructions.md"), "# Tests");
  const guidance = await loadGuidance(wizardContext(project.cwd, scriptedUi([]).ui));
  expect(guidance.skills.map((file) => file.path)).toEqual([".github/skills/example/SKILL.md"]);
  expect(guidance.rules.map((file) => file.path)).toEqual([
    ".github/copilot-instructions.md",
    ".github/instructions/tests.instructions.md",
  ]);
});

test("guidance is reread so later edits are used", async ({ project }) => {
  await installGuidance(project.cwd);
  const context = wizardContext(project.cwd, scriptedUi([]).ui);
  await loadGuidance(context);
  await writeFile(join(project.cwd, SKILL_PATH), "Updated skill");
  expect((await loadGuidance(context)).skills[0]?.content).toBe("Updated skill");
});

test("invalid project guidance fails instead of being silently skipped", async ({ project }) => {
  await installGuidance(project.cwd);
  await writeFile(join(project.cwd, RULE_PATH), Buffer.from([0xff]));
  await expect(loadGuidance(wizardContext(project.cwd, scriptedUi([]).ui))).rejects.toThrow(
    "UTF-8",
  );
});

test("loading guidance respects cancellation", async ({ project }) => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    loadGuidance({ ...wizardContext(project.cwd, scriptedUi([]).ui), signal: controller.signal }),
  ).rejects.toThrow("Cancelled");
});

test("guidance rendering preserves nested fences and records missing project guidance", () => {
  const text = renderGuidance({
    skills: [{ path: "skill.md", content: "Example:\n```md\ncontent\n```" }],
    rules: [],
  });
  expect(text).toContain("````text");
  expect(text).toContain("```md\ncontent\n```");
  expect(text).toContain("## Project rules\n\nNone found.");
});
