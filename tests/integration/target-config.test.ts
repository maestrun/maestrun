import { expect } from "vitest";
import { loadConfig, parseConfig, saveConfig } from "../../src/config/index.js";
import { CONFIG } from "../helpers/context.js";
import { test } from "../helpers/project.js";

const FRONTEND = { executor: "claude", model: "claude-test-model", effort: "max" } as const;
const BACKEND = { executor: "codex", model: "codex-test", effort: "ultra" } as const;

test("round-trips independent frontend and backend assignments without changing stages", async ({
  project,
}) => {
  const config = parseConfig({ ...CONFIG, targets: { frontend: FRONTEND, backend: BACKEND } });
  await saveConfig(project.cwd, config, { exists: false, content: "" });
  expect((await loadConfig(project.cwd)).config).toEqual({
    ...CONFIG,
    targets: { frontend: FRONTEND, backend: BACKEND },
  });
});

test("legacy configurations remain unchanged and native default effort stays absent", () => {
  expect(parseConfig(CONFIG)).toEqual(CONFIG);
  expect(
    parseConfig({ ...CONFIG, targets: { frontend: CONFIG.stages[0], backend: BACKEND } }),
  ).toMatchObject({ targets: { frontend: { executor: "codex", model: "codex-test" } } });
  expect(parseConfig(CONFIG)).not.toHaveProperty("targets");
});

test.for([
  null,
  [],
  {},
  { frontend: FRONTEND },
  { backend: BACKEND },
  { frontend: null, backend: BACKEND },
  { frontend: { ...FRONTEND, executor: "unknown" }, backend: BACKEND },
  { frontend: { ...FRONTEND, model: "model with spaces" }, backend: BACKEND },
  { frontend: { ...FRONTEND, effort: "ultra" }, backend: BACKEND },
  { frontend: FRONTEND, backend: { ...BACKEND, effort: "invalid" } },
])("rejects malformed advanced assignments: %j", (targets) => {
  expect(() => parseConfig({ ...CONFIG, targets })).toThrow("invalid");
});
