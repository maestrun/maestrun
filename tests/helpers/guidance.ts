import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SKILL_PATH = ".agents/skills/verify/SKILL.md";
export const RULE_PATH = ".agents/rules/testing.md";
export const SKILL_TEXT = "# Verify\nUse acceptance criteria to plan verification.";
export const RULE_TEXT = "# Testing\nEvery changed behavior requires a regression test.";

export async function installGuidance(cwd: string): Promise<void> {
  for (const [path, content] of [
    [SKILL_PATH, SKILL_TEXT],
    [RULE_PATH, RULE_TEXT],
    ["AGENTS.md", "# Project rules\nPreserve user changes."],
  ]) {
    if (!path || !content) throw new Error("Invalid guidance fixture");
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
}
