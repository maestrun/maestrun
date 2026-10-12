import { link, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import {
  startRunSession,
  runSession,
  saveSessionFile,
  releaseSession,
} from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";

test.for(["symlink", "hardlink"])(
  "rejects a %s log without changing its target",
  async (kind, { project }) => {
    const target = join(project.root, "outside.log");
    await mkdir(join(project.cwd, ".maestrun"));
    await writeFile(target, "preserve me");
    await (kind === "symlink" ? symlink : link)(target, join(project.cwd, ".maestrun/run.log"));
    await expect(startRunSession(project.cwd, "missing.md")).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("preserve me");
    expect(await readdir(join(project.cwd, ".maestrun"))).toEqual([".gitignore", "run.log"]);
  },
);

test.for([true, false])(
  "rejects a linked state directory with explicit background=%j",
  async (background, { project }) => {
    await writeFile(join(project.bin, "run.log"), "preserve me");
    await symlink(project.bin, join(project.cwd, ".maestrun"));
    await expect(runSession({ cwd: project.cwd, background })).rejects.toThrow("symlink");
    expect(await readFile(join(project.bin, "run.log"), "utf8")).toBe("preserve me");
    expect(await readdir(project.bin)).toEqual(["run.log"]);
  },
);

test("state writes and cleanup refuse a linked parent", async ({ project }) => {
  await mkdir(join(project.bin, "session.lock"));
  await writeFile(join(project.bin, "session.lock/keep"), "preserve me");
  await symlink(project.bin, join(project.cwd, ".maestrun"));
  await expect(saveSessionFile(project.cwd, "cancel", "id")).rejects.toThrow("symlink");
  await expect(releaseSession(project.cwd)).rejects.toThrow("symlink");
  expect(await readFile(join(project.bin, "session.lock/keep"), "utf8")).toBe("preserve me");
  expect(await readdir(project.bin)).toEqual(["session.lock"]);
});
