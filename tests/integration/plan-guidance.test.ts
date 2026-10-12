import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { saveConfig } from "../../src/config/index.js";
import { createPlan } from "../../src/modules/planning/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { installExecutors } from "../helpers/fake-executors.js";
import {
  installGuidance,
  SKILL_PATH,
  SKILL_TEXT,
  RULE_PATH,
  RULE_TEXT,
} from "../helpers/guidance.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

const CONFIG = {
  version: 1,
  stages: [
    { id: "planning", executor: "codex", model: "codex-test", effort: "high" },
    { id: "custom:Audit", executor: "claude", model: "claude-test-model", effort: "max" },
  ],
} as const;

const EXPECTED = [
  "| Planning | Codex | codex-test | high |",
  "| Audit | Claude Code | claude-test-model | max |",
  SKILL_PATH,
  RULE_PATH,
  "AGENTS.md",
  "Preserve user changes.",
  SKILL_TEXT,
  RULE_TEXT,
];

test("plan includes exact saved steps, models, efforts, skills and rules without rewriting config", async ({
  project,
}) => {
  await installExecutors(project);
  await installGuidance(project.cwd);
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const path = join(project.cwd, ".maestrun/config.json");
  const before = await snapshotFile(path);
  const script = scriptedUi(["path", "requirements.md", true]);
  await createPlan({ cwd: project.cwd, ui: script.ui, signal: new AbortController().signal });
  const plan = await readFile(join(project.cwd, "plan.md"), "utf8");
  for (const expected of EXPECTED) expect(plan).toContain(expected);
  const record = JSON.parse((await readFile(project.log, "utf8")).trim());
  for (const expected of [SKILL_TEXT, RULE_TEXT, "claude-test-model", "codex-test"])
    expect(record.input).toContain(expected);
  expect(await snapshotFile(path)).toEqual(before);
  expect(script.remaining()).toBe(0);
});
