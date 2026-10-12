import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { diagnose } from "../../src/modules/onboarding/index.js";
import { saveConfig } from "../../src/config/index.js";
import { test } from "../helpers/project.js";
import { READY } from "../helpers/context.js";
import { RUN_CONFIG } from "../helpers/run.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { snapshotFile } from "../../src/shared/atomic.js";

function input(cwd: string) {
  return { cwd, signal: new AbortController().signal };
}

test("doctor checks executor authentication without generation or project writes", async ({
  project,
}) => {
  await installExecutors(project);
  const before = await readdir(project.cwd);
  const checks = await diagnose(input(project.cwd));
  expect(checks.some((check) => check.name === "codex" && check.status === "ok")).toBe(true);
  expect((await snapshotFile(project.log)).exists).toBe(false);
  expect(await readdir(project.cwd)).toEqual(before);
});

test("configured executors with unknown authentication block diagnosis", async ({ project }) => {
  await saveConfig(project.cwd, RUN_CONFIG, { exists: false, content: "" });
  const checks = await diagnose(input(project.cwd), async () =>
    READY.map((status) =>
      status.id === "claude"
        ? {
            ...status,
            state: "unknown",
            detail: "Could not check authentication",
            nextAction: "Check claude auth status",
          }
        : status,
    ),
  );
  expect(checks.find((check) => check.name === "claude")?.status).toBe("error");
});

test("doctor diagnoses locks without removing them or changing the checkpoint", async ({
  project,
}) => {
  await saveConfig(project.cwd, RUN_CONFIG, { exists: false, content: "" });
  await mkdir(join(project.cwd, ".maestrun/run.lock"));
  await writeFile(join(project.cwd, ".maestrun/run.json"), "saved progress");
  const checks = await diagnose(input(project.cwd), async () => READY);
  expect(checks.find((check) => check.name === "run.lock")?.status).toBe("error");
  expect(await readdir(join(project.cwd, ".maestrun"))).toContain("run.lock");
  expect(await readFile(join(project.cwd, ".maestrun/run.json"), "utf8")).toBe("saved progress");
});
