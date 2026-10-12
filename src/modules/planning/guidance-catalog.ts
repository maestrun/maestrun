import { lstat, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { hasCode } from "../../shared/atomic.js";
import { fileFailure } from "../../shared/errors.js";

export type GuidanceCatalog = Readonly<{ skills: readonly string[]; rules: readonly string[] }>;
const SKILL_ROOTS = [".agents/skills", ".codex/skills", ".claude/skills", ".github/skills"];
const RULE_ROOTS = [".agents/rules", ".codex/rules", ".claude/rules", ".github/instructions"];

async function markdownFiles(cwd: string, root: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(resolve(cwd, root), { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(md|rules)$/iu.test(entry.name))
      .map((entry) => relative(cwd, join(entry.parentPath, entry.name)))
      .filter((path) => !/[\p{Cc}\p{Cf}]/u.test(path));
  } catch (error) {
    if (hasCode(error, "ENOENT")) return [];
    throw fileFailure(`Could not list guidance in ${root}.`);
  }
}

async function instructionFile(cwd: string, name: string): Promise<readonly string[]> {
  try {
    return (await lstat(join(cwd, name))).isFile() ? [name] : [];
  } catch (error) {
    if (hasCode(error, "ENOENT")) return [];
    throw fileFailure(`Could not check ${name}.`);
  }
}

export async function discoverGuidance(cwd: string): Promise<GuidanceCatalog> {
  const [skills, rules, agents] = await Promise.all([
    Promise.all(SKILL_ROOTS.map((root) => markdownFiles(cwd, root))),
    Promise.all(RULE_ROOTS.map((root) => markdownFiles(cwd, root))),
    Promise.all(
      ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"].map((name) =>
        instructionFile(cwd, name),
      ),
    ),
  ]);
  return {
    skills: skills
      .flat()
      .filter((path) => /\/SKILL\.md$/u.test(path))
      .sort(),
    rules: [...agents.flat(), ...rules.flat().sort()],
  };
}
