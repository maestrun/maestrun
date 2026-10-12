import { expect, vi } from "vitest";
import { discoverClaudeModels, discoverModels } from "../../src/modules/executors/index.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";

test("discovers native Claude models with explicit IDs and effort capabilities", async ({
  project,
}) => {
  await installExecutors(project);
  const models = await discoverModels("claude", project.cwd, new AbortController().signal);
  expect(models).toEqual([
    {
      id: "claude-test-model",
      name: "Test Claude",
      isDefault: true,
      efforts: ["low", "medium", "high", "max"],
    },
    { id: "claude-no-effort", name: "No effort", isDefault: false, efforts: [] },
  ]);
});

test.for([
  "rpc-broken",
  "rpc-exit",
  "rpc-error",
  "catalog-invalid",
  "catalog-efforts-invalid",
  "catalog-effort-invalid",
  "claude-models-invalid",
  "claude-id-invalid",
  "claude-response-missing",
])("rejects invalid Claude discovery output: %s", async (mode, { project }) => {
  await installExecutors(project, mode);
  await expect(discoverClaudeModels(project.cwd, new AbortController().signal)).rejects.toThrow();
});

test("keeps unknown effort capabilities distinct from unsupported effort", async ({ project }) => {
  await installExecutors(project, "claude-efforts-missing");
  const models = await discoverClaudeModels(project.cwd, new AbortController().signal);
  expect(models).toEqual([{ id: "claude-custom", name: "Custom", isDefault: false }]);
});

test("skips native aliases when the CLI cannot resolve their explicit IDs", async ({ project }) => {
  await installExecutors(project, "claude-unresolved");
  expect(await discoverClaudeModels(project.cwd, new AbortController().signal)).toEqual([]);
});

test("reports a missing Claude CLI", async ({ project }) => {
  vi.stubEnv("PATH", project.bin);
  await expect(discoverClaudeModels(project.cwd, new AbortController().signal)).rejects.toThrow(
    "Could not start claude",
  );
});

test("never starts Claude discovery after cancellation", async ({ project }) => {
  const controller = new AbortController();
  controller.abort();
  await expect(discoverClaudeModels(project.cwd, controller.signal)).rejects.toThrow("Cancelled");
});
