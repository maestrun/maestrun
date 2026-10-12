import { expect, test } from "vitest";
import { parseCopilotOutput } from "./copilot-output.js";
import { copilotArguments, copilotEnvironment } from "./copilot.client.js";
import { parseConfig } from "../../config/index.js";

function result(events: readonly unknown[]): { code: number; stdout: string; stderr: string } {
  return { code: 0, stdout: events.map((event) => JSON.stringify(event)).join("\n"), stderr: "" };
}

const message = { type: "assistant.message", data: { content: "Final response", model: "test" } };
const completed = { type: "result", exitCode: 0 };

test("uses the final parent assistant message and ignores tool and subagent output", () => {
  expect(
    parseCopilotOutput(
      result([
        { type: "assistant.message", data: { content: "Working" } },
        { type: "tool.execution_complete", data: { content: "tool text" } },
        message,
        { ...message, agentId: "child", data: { content: "child", model: "other" } },
        completed,
      ]),
      "test",
    ),
  ).toBe("Final response");
});

test.for([
  [message],
  [completed],
  [message, { type: "result", exitCode: 1 }],
  [message, { type: "session.error", data: { message: "failed" } }, completed],
  [{ ...message, data: { content: "Wrong model", model: "other" } }, completed],
  [null, completed],
])("rejects incomplete or failed event sequences", (events) => {
  expect(() => parseCopilotOutput(result(events), "test")).toThrow();
});

test("authentication failures provide the Copilot login command", () => {
  expect(() =>
    parseCopilotOutput({ code: 1, stdout: "", stderr: "401 unauthorized" }, "test"),
  ).toThrow(expect.objectContaining({ nextAction: "Run copilot login, then retry the command." }));
});

test("rejects automatic routing and unsupported effort in saved configuration", () => {
  const config = (model: string, effort: string): unknown => ({
    version: 1,
    stages: [{ id: "planning", executor: "copilot", model, effort }],
  });
  expect(() => parseConfig(config("auto", "high"))).toThrow();
  expect(() => parseConfig(config("test", "ultra"))).toThrow();
  expect(parseConfig(config("test", "minimal")).stages[0]?.effort).toBe("minimal");
  expect(() => copilotArguments("auto")).toThrow("exact model");
});

test("keeps native path checks and overrides inherited permission grants", () => {
  expect(copilotArguments("test", "high", true)).not.toContain("--allow-all-paths");
  expect(copilotEnvironment().COPILOT_ALLOW_ALL).toBe("false");
  expect(copilotEnvironment().GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS).toBe("false");
});
