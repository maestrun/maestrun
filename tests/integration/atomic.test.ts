import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { atomicWrite, snapshotFile } from "../../src/shared/atomic.js";
import { test } from "../helpers/project.js";

test("creates a file and atomically replaces an unchanged previous version", async ({
  project,
}) => {
  const path = join(project.cwd, "plan.md");
  await atomicWrite(path, "first plan", await snapshotFile(path));
  await atomicWrite(path, "next plan", await snapshotFile(path));
  expect(await readFile(path, "utf8")).toBe("next plan");
  expect((await readdir(project.cwd)).some((name) => name.endsWith(".tmp"))).toBe(false);
});

test("preserves a plan edited after the snapshot", async ({ project }) => {
  const path = join(project.cwd, "plan.md");
  await writeFile(path, "previous plan");
  const previous = await snapshotFile(path);
  await writeFile(path, "user edits");
  await expect(atomicWrite(path, "generated plan", previous)).rejects.toThrow("changed");
  expect(await readFile(path, "utf8")).toBe("user edits");
});

test("preserves a plan that appeared during generation", async ({ project }) => {
  const path = join(project.cwd, "plan.md");
  const previous = await snapshotFile(path);
  await writeFile(path, "concurrent plan");
  await expect(atomicWrite(path, "generated plan", previous)).rejects.toThrow("changed");
  expect(await readFile(path, "utf8")).toBe("concurrent plan");
});

test("rejects directories and symlinks without modifying their target", async ({ project }) => {
  const folder = join(project.cwd, "folder");
  await mkdir(folder);
  await expect(snapshotFile(folder)).rejects.toThrow("regular file");
  const link = join(project.cwd, "plan.md");
  await symlink(join(project.cwd, "application.ts"), link);
  await expect(snapshotFile(link)).rejects.toThrow("regular file");
  expect(await readFile(join(project.cwd, "application.ts"), "utf8")).toBe(
    "export const original = true;\n",
  );
});

test("reports filesystem failures with a concrete next action", async ({ project }) => {
  const path = join(project.cwd, "application.ts", "plan.md");
  await expect(atomicWrite(path, "plan", { exists: false, content: "" })).rejects.toThrow();
  await expect(snapshotFile(path)).rejects.toThrow("Could not read");
});
