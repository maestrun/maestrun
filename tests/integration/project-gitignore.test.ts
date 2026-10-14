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
  "run.log.1",
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
  expect(await readFile(path, "utf8")).toBe("# User rules\n*\n/samples/\n/logs/\n*.log\n*.log.*\n");
});

const legacyIgnored = [
  "plan.md",
  "local.txt",
  ".maestrun/private/secret.txt",
  ".maestrun/run.log",
  ".maestrun/run.log.1",
  ".maestrun/logs/debug.txt",
  ".maestrun/samples/run-1/application.ts",
];

test("legacy rules exclude samples, logs and the root plan from git add", async ({ project }) => {
  execFileSync("git", ["init", "--quiet"], { cwd: project.cwd });
  await mkdir(join(project.cwd, ".maestrun"));
  await writeFile(join(project.cwd, ".maestrun/.gitignore"), "# Keep my rules\n/private/\n!*.log");
  await writeFile(join(project.cwd, ".gitignore"), "# Root rules\r\n/local.txt");
  await ensureStateDirectory(project.cwd);
  for (const file of [...legacyIgnored, "examples/plan.md"]) {
    const path = join(project.cwd, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "test\n");
  }
  execFileSync("git", ["init", "--quiet", ".maestrun/samples/run-1"], { cwd: project.cwd });
  execFileSync("git", ["add", "."], { cwd: project.cwd });
  const tracked = execFileSync("git", ["ls-files"], { cwd: project.cwd, encoding: "utf8" })
    .trim()
    .split("\n");
  for (const file of legacyIgnored) expect(tracked).not.toContain(file);
  expect(tracked).toContain("examples/plan.md");
  expect(tracked.some((file) => file.includes("samples/"))).toBe(false);
  const root = await readFile(join(project.cwd, ".gitignore"), "utf8");
  expect(root).toBe("# Root rules\r\n/local.txt\n/plan.md\n");
  const state = await readFile(join(project.cwd, ".maestrun/.gitignore"), "utf8");
  expect(state).toMatch(/^# Keep my rules\n\/private\/\n!\*\.log\n/u);
  await ensureStateDirectory(project.cwd);
  expect(await readFile(join(project.cwd, ".gitignore"), "utf8")).toBe(root);
  expect(await readFile(join(project.cwd, ".maestrun/.gitignore"), "utf8")).toBe(state);
});

test("state directory setup rejects a symlinked root ignore file", async ({ project }) => {
  const target = join(project.root, "outside.txt");
  await writeFile(target, "preserve me\n");
  await symlink(target, join(project.cwd, ".gitignore"));
  await expect(ensureStateDirectory(project.cwd)).rejects.toThrow("regular file");
  expect(await readFile(target, "utf8")).toBe("preserve me\n");
});

test("state directory setup rejects a symlinked ignore file", async ({ project }) => {
  await mkdir(join(project.cwd, ".maestrun"));
  const target = join(project.cwd, "outside.txt");
  await writeFile(target, "preserve me\n");
  await symlink(target, join(project.cwd, ".maestrun/.gitignore"));
  await expect(ensureStateDirectory(project.cwd)).rejects.toThrow("regular file");
  expect(await readFile(target, "utf8")).toBe("preserve me\n");
});
