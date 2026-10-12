import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { loadExtensions, extensionExecutor } from "../../src/modules/plugins/index.js";
import { CancelError } from "../../src/shared/errors.js";
import type { StepInput } from "../../src/contracts/run.js";
import { test } from "../helpers/project.js";

const INPUT: StepInput = {
  cwd: ".",
  task: { id: "a", title: "A", instructions: "Audit", dependsOn: [] },
  stage: { id: "custom:Audit", executor: "codex", model: "test" },
  signal: new AbortController().signal,
  timeoutMs: 5000,
};

test("loads a trusted module and runs custom stages between hooks", async ({ project }) => {
  await writeFile(
    join(project.cwd, "extension.mjs"),
    'export default { apiVersion: 1, name: "audit", stages: { "custom:Audit": ({ task }) => `Audited ${task.id}` } };',
  );
  const plugins = await loadExtensions(project.cwd, ["./extension.mjs"], true);
  const fallback = vi.fn(async () => "Fallback");
  const events: string[] = [];
  const execute = extensionExecutor(
    [
      {
        name: "hooks",
        beforeStep: () => {
          events.push("before");
        },
        afterStep: ({ result }) => {
          events.push(result);
        },
      },
      ...plugins,
    ],
    fallback,
  );
  expect(await execute(INPUT)).toBe("Audited a");
  expect(events).toEqual(["before", "Audited a"]);
  expect(fallback).not.toHaveBeenCalled();
  expect(await execute({ ...INPUT, stage: { ...INPUT.stage, id: "testing" } })).toBe("Fallback");
});

test.for([
  "null",
  '{ apiVersion: 2, name: "x" }',
  '{ apiVersion: 1, name: "x", beforeStep: true }',
  '{ apiVersion: 1, name: "x", stages: { testing() {} } }',
  '{ apiVersion: 1, name: "x", stages: null }',
  '{ apiVersion: 1, name: "" }',
])("rejects invalid extension contracts: %s", async (value, { project }) => {
  await writeFile(join(project.cwd, "extension.mjs"), `export default ${value};`);
  await expect(loadExtensions(project.cwd, ["./extension.mjs"], true)).rejects.toThrow(
    "Extension failed",
  );
});

test("rejects missing modules and symlinks escaping the project", async ({ project }) => {
  await expect(loadExtensions(project.cwd, ["./missing.mjs"], true)).rejects.toThrow(
    "Extension failed",
  );
  const outside = join(project.root, "outside.mjs");
  await writeFile(outside, 'throw new Error("must not import");');
  await symlink(outside, join(project.cwd, "escape.mjs"));
  await expect(loadExtensions(project.cwd, ["./escape.mjs"], true)).rejects.toThrow(
    "Extension failed",
  );
});

test.for([true, false])(
  "rejects duplicate stage handlers or names (%j)",
  async (sameName, { project }) => {
    for (const name of ["a", "b"])
      await writeFile(
        join(project.cwd, `${name}.mjs`),
        `export default { apiVersion: 1, name: '${sameName ? "same" : name}', stages: { 'custom:${sameName ? name : "Audit"}': () => 'done' } };`,
      );
    await expect(loadExtensions(project.cwd, ["./a.mjs", "./b.mjs"], true)).rejects.toThrow(
      "duplicate",
    );
  },
);

test("extension failures stop the step and retain cancellation semantics", async () => {
  const fallback = vi.fn(async () => "done");
  const failing = extensionExecutor(
    [
      {
        name: "broken",
        beforeStep: () => {
          throw new Error("sensitive details");
        },
      },
    ],
    fallback,
  );
  await expect(failing(INPUT)).rejects.toThrow("Extension failed: broken");
  expect(fallback).not.toHaveBeenCalled();
});

test("extension cancellation and empty results are not successful steps", async () => {
  const fallback = vi.fn(async () => "done");
  const cancelled = extensionExecutor(
    [
      {
        name: "cancel",
        afterStep: () => {
          throw new CancelError();
        },
      },
    ],
    fallback,
  );
  await expect(cancelled(INPUT)).rejects.toThrow(CancelError);
  const empty = extensionExecutor(
    [{ name: "empty", stages: { "custom:Audit": () => "" } }],
    fallback,
  );
  await expect(empty(INPUT)).rejects.toThrow("Extension failed: empty");
});
