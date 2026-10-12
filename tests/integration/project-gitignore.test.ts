import { execFileSync } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { saveConfigDocument } from "../../src/config/config-storage.js";
import { ensureStateDirectory } from "../../src/shared/project-state.js";
import { test } from "../helpers/project.js";

const allowed = [".gitignore", "config.json", "layout.json", "steps/review.md"];
const ignored = [
  ".env",
  "credentials.json",
  "auth.json",
  "private.pem",
  "run.log",
  "run.json",
  "session.json",
  "run.lock/owner",
  "conversations/session.json",
  "logs/debug.txt",
  "samples/run-1/.maestrun/config.json",
  "steps/.env",
  "steps/credentials.json",
  "steps/debug.log",
  "steps/nested/config.json",
  "unknown-future-file.json",
];

test("project creation allows only configuration and step instructions into Git", async ({
  project,
}) => {
  execFileSync("git", ["init", "--quiet"], { cwd: project.cwd });
  await saveConfigDocument(project.cwd, { version: 1, stages: [] }, { exists: false, content: "" });
  for (const file of [...allowed.slice(2), ...ignored]) {
    const path = join(project.cwd, ".maestrun", file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "test\n");
  }
  const visible = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", ".maestrun"],
    { cwd: project.cwd, encoding: "utf8" },
  );
  expect(visible.trim().split("\n").sort()).toEqual(
    allowed.map((file) => `.maestrun/${file}`).sort(),
  );
});

test("state directory setup preserves existing ignore rules", async ({ project }) => {
  await ensureStateDirectory(project.cwd);
  const path = join(project.cwd, ".maestrun/.gitignore");
  const original = await readFile(path, "utf8");
  await ensureStateDirectory(project.cwd);
  expect(await readFile(path, "utf8")).toBe(original);
  await writeFile(path, "# User rules\n*\n");
  await ensureStateDirectory(project.cwd);
  expect(await readFile(path, "utf8")).toBe("# User rules\n*\n");
});

test("state directory setup rejects a symlinked ignore file", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun"));
  const target = join(project.cwd, "outside.txt");
  await writeFile(target, "preserve me\n");
  await symlink(target, join(project.cwd, ".maestrun/.gitignore"));
  await expect(ensureStateDirectory(project.cwd)).rejects.toThrow("regular file");
  expect(await readFile(target, "utf8")).toBe("preserve me\n");
});
