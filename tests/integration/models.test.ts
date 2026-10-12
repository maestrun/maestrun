import { expect, vi } from "vitest";
import { discoverCodexModels } from "../../src/modules/executors/index.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";

test("initializes the official protocol and reads all catalog pages", async ({ project }) => {
  await installExecutors(project);
  const models = await discoverCodexModels(project.cwd, new AbortController().signal);
  expect(models).toEqual([
    {
      id: "codex-test",
      name: "Test model",
      isDefault: true,
      efforts: ["low", "medium", "high"],
      defaultEffort: "medium",
    },
    {
      id: "codex-other",
      name: "Other model",
      isDefault: false,
      efforts: ["high", "ultra"],
      defaultEffort: "high",
    },
  ]);
});

test.for([
  "rpc-broken",
  "rpc-exit",
  "rpc-error",
  "catalog-invalid",
  "catalog-efforts-invalid",
  "catalog-effort-invalid",
  "catalog-default-invalid",
  "catalog-cursor-invalid",
  "catalog-cycle",
])("rejects %s discovery output", async (mode, { project }) => {
  await installExecutors(project, mode);
  await expect(discoverCodexModels(project.cwd, new AbortController().signal)).rejects.toThrow();
});

test("cleans up when app-server cannot start", async ({ project }) => {
  vi.stubEnv("PATH", project.bin);
  await expect(discoverCodexModels(project.cwd, new AbortController().signal)).rejects.toThrow(
    "discovery",
  );
});

test("never starts discovery after cancellation", async ({ project }) => {
  const controller = new AbortController();
  controller.abort();
  await expect(discoverCodexModels(project.cwd, controller.signal)).rejects.toThrow("Cancelled");
});

test("accepts older Codex catalogs without effort metadata", async ({ project }) => {
  await installExecutors(project, "codex-efforts-missing");
  const models = await discoverCodexModels(project.cwd, new AbortController().signal);
  expect(models[0]).toEqual({ id: "codex-test", name: "Test model", isDefault: true });
});

test("retains supported efforts when the Codex default is absent", async ({ project }) => {
  await installExecutors(project, "codex-default-missing");
  const models = await discoverCodexModels(project.cwd, new AbortController().signal);
  expect(models[0]?.efforts).toEqual(["low", "medium", "high"]);
  expect(models[0]?.defaultEffort).toBeUndefined();
});
