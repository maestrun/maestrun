import { expect } from "vitest";
import { validEffort } from "../../src/contracts/workflow.js";
import {
  detectExecutor,
  discoverModels,
  grokAuthState,
  parseGrokModels,
} from "../../src/modules/executors/index.js";
import { installGrok } from "../helpers/grok.js";
import { test } from "../helpers/project.js";

test("Grok effort validation accepts canonical levels without coercing invalid values", () => {
  for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    expect(validEffort(effort, "grok")).toBe(true);
  for (const effort of ["ultra", ["high"], {}, null, undefined])
    expect(validEffort(effort, "grok")).toBe(false);
});

test.for([
  { mode: "success", state: "ready" },
  { mode: "no-auth", state: "unauthenticated" },
  { mode: "old", state: "incompatible" },
])("detects Grok $state without generating a response", async ({ mode, state }, { project }) => {
  await installGrok(project, mode);
  const status = await detectExecutor({
    id: "grok",
    cwd: project.cwd,
    signal: new AbortController().signal,
  });
  expect(status.state).toBe(state);
});

test("discovers exact model identifiers and their default", async ({ project }) => {
  await installGrok(project);
  expect(await discoverModels("grok", project.cwd, new AbortController().signal)).toEqual([
    { id: "grok-test", name: "grok-test", isDefault: true },
    { id: "grok-other", name: "grok-other", isDefault: false },
  ]);
});

test.for(["no-auth", "bad-catalog"])("rejects %s model discovery", async (mode, { project }) => {
  await installGrok(project, mode);
  await expect(discoverModels("grok", project.cwd, new AbortController().signal)).rejects.toThrow();
});

test.for([
  "You are using XAI_API_KEY.",
  "You are logged in with grok.com.",
  "You are authenticated via deployment key.",
  "Model 'custom-model' is using its own API key.",
])("recognizes native authentication: %s", (stdout) => {
  expect(grokAuthState({ stdout, stderr: "", code: 0 })).toBe("ready");
});

test("keeps unrecognized or failed authentication checks unknown", () => {
  expect(grokAuthState({ stdout: "Unexpected", stderr: "", code: 0 })).toBe("unknown");
  expect(grokAuthState({ stdout: "You are using XAI_API_KEY.", stderr: "offline", code: 1 })).toBe(
    "unknown",
  );
});

test("parses colored CRLF catalogs and rejects invalid identifiers", () => {
  expect(
    parseGrokModels("Available models:\r\n  * \u001b[32mgrok-test\u001b[0m (default)\r\n"),
  ).toEqual([{ id: "grok-test", name: "grok-test", isDefault: true }]);
  expect(() => parseGrokModels("Available models:\n  - invalid model\n")).toThrow(
    "invalid model catalog",
  );
});
