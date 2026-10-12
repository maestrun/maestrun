import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import { generateInteractivePlan } from "../../src/modules/planning/index.js";
import { BackError, CancelError } from "../../src/shared/errors.js";
import { DRAFT } from "../helpers/context.js";
import { test } from "../helpers/project.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { scriptedUi } from "../helpers/ui.js";

function input(
  cwd: string,
  ui: ReturnType<typeof scriptedUi>["ui"],
): Parameters<typeof generateInteractivePlan>[0] {
  return { cwd, ui, draft: DRAFT, signal: new AbortController().signal };
}

test("Codex starts native Plan mode with exact model and sends interactive answers", async ({
  project,
}) => {
  await executionProcesses(project);
  const script = scriptedUi(["0"]);
  expect(await generateInteractivePlan(input(project.cwd, script.ui))).toContain(
    "Acceptance criteria",
  );
  const log = await readFile(project.log, "utf8");
  expect(log).toContain('"mode":"plan"');
  expect(log).toContain('"model":"codex-test"');
  expect(log).toContain('"sandbox":"read-only"');
  expect(log).toContain('"scope":{"answers":["Small"]}');
  expect(script.remaining()).toBe(0);
  expect(script.messages.join("")).toContain("Acceptance criteria");
});

test("Claude planning exchanges questions and answers before returning the final plan", async ({
  project,
}) => {
  await executionProcesses(project, "questions");
  const script = scriptedUi(["Small scope"]);
  const draft = {
    ...DRAFT,
    config: {
      ...DRAFT.config,
      stages: [{ id: "planning" as const, executor: "claude" as const, model: "claude-test" }],
    },
  };
  expect(await generateInteractivePlan({ ...input(project.cwd, script.ui), draft })).toContain(
    "Acceptance criteria",
  );
  const log = await readFile(project.log, "utf8");
  expect(log).toContain("Small scope");
  expect(log).toContain("--permission-mode");
  expect(log.trim().split("\n")).toHaveLength(2);
  expect(script.messages.join("")).toContain("Acceptance criteria");
});

test.for(["bad-rpc", "rpc-error", "approval", "file-change"])(
  "Codex fails safely for %s",
  async (mode, { project }) => {
    await executionProcesses(project, mode);
    await expect(
      generateInteractivePlan(input(project.cwd, scriptedUi(["0"]).ui)),
    ).rejects.toThrow();
  },
);

test("Escape at a planning question cancels the executor", async ({ project }) => {
  await executionProcesses(project);
  await expect(
    generateInteractivePlan(input(project.cwd, scriptedUi([new BackError()]).ui)),
  ).rejects.toThrow(CancelError);
});

test("interactive planning respects the configured timeout", async ({ project }) => {
  await executionProcesses(project, "hang");
  const draft = { ...DRAFT, config: { ...DRAFT.config, timeoutMs: 50 } };
  await expect(
    generateInteractivePlan({ ...input(project.cwd, scriptedUi([]).ui), draft }),
  ).rejects.toThrow("timed out");
});

test.for(["codex", "claude"] as const)(
  "%s interactive planning receives the advanced document format",
  async (executor, { project }) => {
    await executionProcesses(project, "questions");
    const script = scriptedUi([executor === "codex" ? "0" : "Small scope"]);
    await generateInteractivePlan({
      ...input(project.cwd, script.ui),
      draft: {
        ...DRAFT,
        planMode: "advanced",
        planFolder: "tasks",
        config: { ...CONFIG_FOR(executor) },
      },
    });
    const log = await readFile(project.log, "utf8");
    expect(log).toContain("<!-- maestrun:prd -->");
    expect(log).toContain("<!-- maestrun:techspec -->");
    expect(log).toContain("<!-- maestrun:tasks -->");
  },
);

function CONFIG_FOR(executor: "codex" | "claude"): typeof DRAFT.config {
  return { ...DRAFT.config, stages: [{ id: "planning", executor, model: `${executor}-test` }] };
}
