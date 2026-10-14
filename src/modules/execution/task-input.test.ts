import { expect, test } from "vitest";
import { StepInputRequired } from "../../shared/errors.js";
import { stepResult, stepPrompt } from "./step-protocol.js";
import { validInputRequests } from "./task-input.js";
import { codexInputRequest } from "./codex-task-input.js";
import type { TaskInputRequest } from "../../contracts/run.js";

const request: TaskInputRequest = {
  id: "00000000-0000-0000-0000-000000000001",
  stage: "implementation",
  question: "Which region?",
  summary: "Need a decision",
  answer: "Brazil",
};

test.each(["needs_input", "on_hold"])(
  "%s requests are distinct from failures and validate their resume context",
  (status) => {
    expect(() => stepResult(JSON.stringify({ status, ...request }))).toThrow(StepInputRequired);
    for (const value of [
      {},
      { question: "" },
      { question: "x", summary: "" },
      { question: "x".repeat(32001), summary: "x" },
    ])
      expect(() => stepResult(JSON.stringify({ status, ...value }))).toThrow("Invalid request");
    expect(validInputRequests([request])).toBe(true);
    expect(validInputRequests([{ ...request, answer: " " }])).toBe(false);
    expect(validInputRequests([{ ...request, id: "../outside" }])).toBe(false);
    expect(validInputRequests([request, request])).toBe(false);
    expect(
      validInputRequests([
        { ...request, answer: undefined },
        { ...request, id: request.id.replace(/1$/u, "2"), answer: undefined },
      ]),
    ).toBe(false);
  },
);

test("resume prompts include the question, answer and progress context", async () => {
  const prompt = await stepPrompt({
    cwd: "/tmp",
    task: { id: "a", title: "A", instructions: "Build A", dependsOn: [] },
    stage: { id: "implementation", executor: "codex", model: "test" },
    timeoutMs: 1000,
    signal: new AbortController().signal,
    inputRequests: [request],
  });
  expect(prompt).toContain('"status":"needs_input"');
  expect(prompt).toContain('"answer":"Brazil"');
  expect(prompt).toContain("Need a decision");
  expect(prompt).toContain("Preserve completed work");
});

test("native input requests preserve all questions and choices without approving tools", () => {
  const result = codexInputRequest(
    {
      method: "item/tool/requestUserInput",
      params: {
        questions: [
          {
            question: "Which region?",
            options: [{ label: "Brazil", description: "South America" }],
          },
          { question: "Which language?" },
        ],
      },
    },
    "Files inspected",
  );
  expect(JSON.parse(result ?? "")).toEqual({
    status: "needs_input",
    summary: "Files inspected",
    question: "Which region?\n- Brazil: South America\n\nWhich language?",
  });
  expect(
    codexInputRequest({ method: "item/commandExecution/requestApproval" }, ""),
  ).toBeUndefined();
});

test("invalid native questions are rejected", () => {
  expect(() =>
    codexInputRequest({ method: "item/tool/requestUserInput", params: { questions: [] } }, ""),
  ).toThrow();
  expect(() =>
    codexInputRequest(
      { method: "item/tool/requestUserInput", params: { questions: [{ question: " " }] } },
      "",
    ),
  ).toThrow();
});

test("native authentication errors retain the actionable login instruction", async () => {
  const { codexTaskFailure } = await import("./codex-task-input.js");
  const { AuthenticationRequiredError } = await import("../../shared/errors.js");
  const error = codexTaskFailure({ message: "401 unauthorized" });
  expect(error).toBeInstanceOf(AuthenticationRequiredError);
  expect(error.nextAction).toContain("codex login");
  expect(codexTaskFailure({ message: "Unknown model" })).not.toBeInstanceOf(
    AuthenticationRequiredError,
  );
});
