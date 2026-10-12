import { expect } from "vitest";
import type { ExecutorStatus } from "../../contracts/workflow.js";
import { wizardContext, READY } from "../../../tests/helpers/context.js";
import { test } from "../../../tests/helpers/project.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";
import { selectAssignment } from "./assignments.js";

const MISSING: ExecutorStatus = {
  id: "grok",
  state: "missing",
  detail: "Not installed or not on PATH",
  nextAction: "Install Grok Build: npm install -g @xai-official/grok",
};
const LOGIN: ExecutorStatus = {
  id: "copilot",
  state: "unauthenticated",
  detail: "Authentication required",
  nextAction: "Run copilot login",
};

test("hides missing executors and falls back from a missing saved executor", async ({
  project,
}) => {
  const script = scriptedUi(["codex", "codex-test", "high"]);
  const context = wizardContext(project.cwd, script.ui);
  const result = await selectAssignment(
    {
      ...context,
      services: { ...context.services, detect: async () => [...READY, MISSING, LOGIN] },
    },
    { executor: "grok", model: "saved-model" },
  );
  expect(result).toEqual({ executor: "codex", model: "codex-test", effort: "high" });
  expect(script.calls[0]?.initial).toBe("codex");
  expect(script.calls[0]?.choices).toEqual([
    { name: "Codex — Ready", value: "codex" },
    { name: "Claude Code — Ready", value: "claude" },
    { name: "GitHub Copilot", value: "copilot", disabled: "Authentication required" },
    { name: "Check executors again", value: "refresh" },
  ]);
  expect(script.messages).toEqual(["GitHub Copilot: Run copilot login"]);
  expect(script.remaining()).toBe(0);
});

test("explains an empty executor list and discovers installed tools on refresh", async ({
  project,
}) => {
  const script = scriptedUi(["refresh", "codex", "codex-test", "high"]);
  const context = wizardContext(project.cwd, script.ui);
  let checks = 0;
  await selectAssignment(
    {
      ...context,
      services: { ...context.services, detect: async () => (checks++ === 0 ? [MISSING] : READY) },
    },
    { executor: "grok", model: "" },
  );
  expect(script.calls[0]?.choices).toEqual([{ name: "Check executors again", value: "refresh" }]);
  expect(script.messages).toEqual([
    "No executors found on PATH. Install an executor, then check again.",
    MISSING.nextAction,
  ]);
  expect(script.calls[1]?.choices?.map((choice) => choice.value)).toEqual([
    "codex",
    "claude",
    "refresh",
  ]);
  expect(checks).toBe(2);
  expect(script.remaining()).toBe(0);
});
