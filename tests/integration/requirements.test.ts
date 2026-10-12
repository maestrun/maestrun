import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import {
  listDirectory,
  readRequirements,
  validateRequirements,
} from "../../src/shared/requirements.js";
import { test } from "../helpers/project.js";

test.for(["", " \n\t "])('rejects empty requirements "%s"', (text) => {
  expect(() => validateRequirements(text)).toThrow("empty");
});

test("rejects requirements exceeding the documented input limit", () => {
  expect(() => validateRequirements("x".repeat(1024 * 1024 + 1))).toThrow("1 MiB");
});

test("reads a relative file with spaces and preserves multiline content", async ({ project }) => {
  await writeFile(join(project.cwd, "work requirements.md"), "first line\nsecond line\n");
  const requirements = await readRequirements(project.cwd, "work requirements.md");
  expect(requirements).toEqual({
    text: "first line\nsecond line",
    source: join(project.cwd, "work requirements.md"),
  });
});

test("reads an explicitly selected absolute file outside the project", async ({ project }) => {
  const path = join(project.root, "requirements.txt");
  await writeFile(path, "Requested work");
  expect((await readRequirements(project.cwd, path)).text).toBe("Requested work");
});

test("rejects missing files and directories", async ({ project }) => {
  await expect(readRequirements(project.cwd, "missing.md")).rejects.toThrow("Could not open");
  await expect(readRequirements(project.cwd, ".")).rejects.toThrow("regular");
});

test.for([Buffer.from([0xff]), Buffer.from("binary\0file"), Buffer.from("   ")])(
  "rejects invalid text and binary requirements",
  async (content, { project }) => {
    await writeFile(join(project.cwd, "invalid.txt"), content);
    await expect(readRequirements(project.cwd, "invalid.txt")).rejects.toThrow();
  },
);

test("rejects oversized requirement files", async ({ project }) => {
  await writeFile(join(project.cwd, "large.txt"), "x".repeat(1024 * 1024 + 1));
  await expect(readRequirements(project.cwd, "large.txt")).rejects.toThrow("1 MiB");
});

test("lists directories before files and excludes generated and dependency folders", async ({
  project,
}) => {
  for (const name of ["docs", ".git", ".maestrun", "node_modules"])
    await mkdir(join(project.cwd, name));
  await symlink(join(project.cwd, "requirements.md"), join(project.cwd, "linked.md"));
  const entries = await listDirectory(project.cwd);
  expect(entries.map((entry) => entry.name)).toEqual(["docs", "application.ts", "requirements.md"]);
  expect(entries[0]?.directory).toBe(true);
  await expect(listDirectory(join(project.cwd, "missing"))).rejects.toThrow("Could not list");
});
