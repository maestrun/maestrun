import { readFile } from "node:fs/promises";
import { expect, vi } from "vitest";
import { generateClaude } from "../../src/modules/executors/index.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";

test("the chosen Claude effort overrides an inherited environment setting", async ({ project }) => {
  await installExecutors(project);
  vi.stubEnv("CLAUDE_CODE_EFFORT_LEVEL", "low");
  await generateClaude({
    cwd: project.cwd,
    model: "claude-test-model",
    effort: "max",
    prompt: "Plan the work.",
    signal: new AbortController().signal,
  });
  const call: unknown = JSON.parse((await readFile(project.log, "utf8")).trim());
  expect(call).toMatchObject({ args: expect.arrayContaining(["--effort", "max"]), effort: "max" });
});
