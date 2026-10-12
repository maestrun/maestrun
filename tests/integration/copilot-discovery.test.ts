import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import { detectExecutor, discoverModels } from "../../src/modules/executors/index.js";
import { installCopilot } from "../helpers/copilot.js";
import { test } from "../helpers/project.js";

test.for(["success", "no-auth", "auth-invalid", "old"])(
  "detects Copilot %s without inference",
  async (mode, { project }) => {
    await installCopilot(project, mode);
    const status = await detectExecutor({
      cwd: project.cwd,
      signal: new AbortController().signal,
      id: "copilot",
    });
    expect(status.state).toBe(
      {
        success: "ready",
        "no-auth": "unauthenticated",
        "auth-invalid": "unknown",
        old: "incompatible",
      }[mode],
    );
    await expect(readFile(project.log)).rejects.toThrow();
  },
);

test("discovers native models, excluding automatic routing and disabled models", async ({
  project,
}) => {
  await installCopilot(project);
  const models = await discoverModels("copilot", project.cwd, new AbortController().signal);
  expect(models).toEqual([
    {
      id: "copilot-test",
      name: "Test Copilot",
      isDefault: false,
      efforts: ["low", "high"],
      defaultEffort: "high",
    },
    { id: "copilot-simple", name: "Simple", isDefault: false, efforts: [] },
  ]);
});

test.for([
  "catalog-invalid",
  "catalog-effort-invalid",
  "catalog-default-invalid",
  "rpc-invalid",
  "rpc-exit",
])("rejects %s discovery", async (mode, { project }) => {
  await installCopilot(project, mode);
  await expect(
    discoverModels("copilot", project.cwd, new AbortController().signal),
  ).rejects.toThrow();
});
