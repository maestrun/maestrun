import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import os from "node:os";
import { join } from "node:path";
import { afterEach, test as base, vi } from "vitest";

export type Project = Readonly<{ root: string; cwd: string; bin: string; log: string }>;

async function createProject(id: string): Promise<Project> {
  const root = await mkdtemp(join(tmpdir(), `maestrun-test-${id}-`));
  const cwd = join(root, "project");
  const bin = join(root, "bin");
  await mkdir(cwd);
  await mkdir(bin);
  await writeFile(
    join(cwd, "requirements.md"),
    "Add a small command with clear acceptance criteria.\n",
  );
  await writeFile(join(cwd, "application.ts"), "export const original = true;\n");
  return { root, cwd, bin, log: join(root, "executor-log.jsonl") };
}

export const test = base.extend<{ project: Project }>({
  project: async ({ task }, use) => {
    const project = await createProject(task.id);
    vi.spyOn(os, "homedir").mockReturnValue(join(project.root, "home"));
    try {
      await use(project);
    } finally {
      await rm(project.root, { recursive: true, force: true });
    }
  },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
