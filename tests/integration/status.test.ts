import { expect, vi } from "vitest";
import { detectExecutor, detectExecutors, statusLabel } from "../../src/modules/executors/index.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";

test("detects installed and missing executors without invoking a model", async ({ project }) => {
  await installExecutors(project);
  const statuses = await detectExecutors(project.cwd, new AbortController().signal);
  expect(statuses.map((status) => status.state)).toEqual(["ready", "ready", "ready", "missing"]);
  expect(statuses.map(statusLabel)).toEqual([
    "Codex — Ready",
    "Claude Code — Ready",
    "GitHub Copilot — Ready",
    "Grok Build — Not installed or not on PATH",
  ]);
});

test.for(["codex", "claude", "copilot", "grok"] as const)(
  "identifies missing %s and gives an installation action",
  async (id, { project }) => {
    vi.stubEnv("PATH", project.bin);
    const status = await detectExecutor({
      id,
      cwd: project.cwd,
      signal: new AbortController().signal,
    });
    expect(status.state).toBe("missing");
    expect(status.nextAction).toContain("Install");
  },
);

test.for([
  { mode: "old", state: "incompatible", action: "update" },
  { mode: "no-auth", state: "unauthenticated", action: "login" },
  { mode: "version-fail", state: "unknown", action: "--version" },
  { mode: "auth-invalid", state: "unknown", action: "--version" },
  { mode: "auth-unknown", state: "unknown", action: "--version" },
  { mode: "auth-false", state: "unauthenticated", action: "login" },
])("identifies an executor's $mode state", async ({ mode, state, action }, { project }) => {
  await installExecutors(project, mode);
  const status = await detectExecutor({
    id: "claude",
    cwd: project.cwd,
    signal: new AbortController().signal,
  });
  expect(status.state).toBe(state);
  expect(status.nextAction).toContain(action);
});

test("does not swallow cancelled detection", async ({ project }) => {
  const controller = new AbortController();
  controller.abort();
  await expect(detectExecutors(project.cwd, controller.signal)).rejects.toThrow("Cancelled");
});
