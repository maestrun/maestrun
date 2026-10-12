import { expect, test } from "vitest";
import { codexArguments, parseCodexOutput } from "./codex.client.js";
import { claudeArguments, parseClaudeOutput } from "./claude.client.js";
import { executorFailure, isCancellation } from "../../shared/errors.js";

function codexResult(events: readonly unknown[]): { code: number; stdout: string; stderr: string } {
  return { code: 0, stdout: events.map((event) => JSON.stringify(event)).join("\n"), stderr: "" };
}

test("Codex collects the final assistant message only after completion", () => {
  const result = codexResult([
    { type: "item.started", item: { type: "command_execution" } },
    { type: "item.completed", item: { type: "reasoning", text: "internal reasoning" } },
    { type: "item.completed", item: { type: "agent_message", text: "Earlier message" } },
    { type: "item.completed", item: { type: "agent_message", text: "Final plan" } },
    { type: "turn.completed" },
  ]);
  expect(parseCodexOutput(result)).toBe("Final plan");
});

test.for([
  null,
  {},
  { type: "turn.failed" },
  { type: "item.completed", item: { type: "file_change" } },
])("rejects failed, incomplete, or unsafe Codex output: %j", (event) => {
  expect(() => parseCodexOutput(codexResult([event]))).toThrow();
});

test("reports unsupported selections and malformed Codex output", () => {
  expect(() => parseCodexOutput({ code: 1, stdout: "", stderr: "model not found" })).toThrow(
    "selected model",
  );
  expect(() => parseCodexOutput({ code: 0, stdout: "not JSON", stderr: "" })).toThrow(
    "invalid output",
  );
  expect(() =>
    parseCodexOutput({ code: 1, stdout: "not JSON", stderr: "model unsupported" }),
  ).toThrow("selected model");
  expect(() =>
    parseCodexOutput(
      codexResult([{ type: "error", message: "401 unauthorized" }, { type: "turn.failed" }]),
    ),
  ).toThrow("authentication");
});

test.for([
  "not JSON",
  "null",
  '{"subtype":"success","is_error":false,"result":"  "}',
  '{"subtype":"error","is_error":true,"result":"model unsupported"}',
])("rejects invalid Claude Code output: %s", (stdout) => {
  expect(() => parseClaudeOutput({ code: 0, stdout, stderr: "" }, "claude-test-model")).toThrow();
});

test("rejects a different model and reports Claude Code authentication errors", () => {
  const stdout = JSON.stringify({
    subtype: "success",
    is_error: false,
    result: "Plan",
    modelUsage: { "claude-other-model": {} },
  });
  expect(() => parseClaudeOutput({ code: 0, stdout, stderr: "" }, "claude-test-model")).toThrow(
    "different model",
  );
  expect(() =>
    parseClaudeOutput({ code: 1, stdout: "", stderr: "401 unauthorized" }, "claude-test-model"),
  ).toThrow("authentication");
});

test("preserves an explicit Claude model's context modifier", () => {
  const stdout = JSON.stringify({
    subtype: "success",
    is_error: false,
    result: "Plan",
    modelUsage: { "claude-test-model": {} },
  });
  expect(parseClaudeOutput({ code: 0, stdout, stderr: "" }, "claude-test-model[1m]")).toBe("Plan");
});

test("command arguments retain exact models, planning restrictions and disabled fallback", () => {
  const codex = codexArguments("codex-test");
  expect(codex[codex.indexOf("--model") + 1]).toBe("codex-test");
  expect(codex[codex.indexOf("--sandbox") + 1]).toBe("read-only");
  expect(codex[codex.indexOf("--ask-for-approval") + 1]).toBe("never");
  const claude = claudeArguments("claude-test-model");
  expect(claude[claude.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
  expect(claude).not.toContain("--fallback-model");
  expect(JSON.parse(claude[claude.indexOf("--settings") + 1] ?? "")).toEqual({
    disableAllHooks: true,
    switchModelsOnFlag: false,
    availableModels: ["claude-test-model"],
    fallbackModel: [],
  });
});

test("reports errors without reproducing credential-bearing executor output", () => {
  const error = executorFailure("Codex", "quota exhausted; sensitive test credential");
  expect(error.message).toContain("usage limit");
  expect(error.message + error.nextAction).not.toContain("sensitive test credential");
  expect(isCancellation(new Error("ordinary error"))).toBe(false);
  const abort = new Error("interrupted");
  abort.name = "AbortError";
  expect(isCancellation(abort)).toBe(true);
});
