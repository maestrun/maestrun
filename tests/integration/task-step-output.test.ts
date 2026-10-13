import { expect } from "vitest";
import type { RunReport, StepInput } from "../../src/contracts/run.js";
import type { SessionView } from "../../src/modules/execution/execution.types.js";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { refreshSessionView } from "../../src/modules/execution/run-session-view.js";
import {
  saveSessionFile,
  sessionFile,
} from "../../src/modules/execution/run-session.repository.js";
import { taskChannel } from "../../src/modules/execution/task-conversation.js";
import { taskBody } from "../../src/modules/execution/run-task-view.js";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { viewTask } from "../helpers/run-view.js";
import { scriptedUi } from "../helpers/ui.js";

async function recordOutput(input: StepInput): Promise<string> {
  if (!input.conversationId) throw new Error("Missing conversation");
  const channel = await taskChannel(input.cwd, input.conversationId);
  channel.output(`${input.task.id}/${input.stage.id}: full output\nSecond line.`);
  await channel.close();
  return `${input.task.id}/${input.stage.id}: final result`;
}

function sessionView(cwd: string): SessionView {
  return {
    cwd,
    ui: scriptedUi([]).ui,
    detached: false,
    closed: true,
    lines: new Map(),
    session: {
      id: "test",
      pid: process.pid,
      startedAt: "1970-01-01T00:00:00Z",
      status: "completed",
    },
    selection: { filter: 0, selected: "a", details: true, logs: false, scroll: 0 },
  };
}

test("persists each step's log reference and restores selected task logs after reconnecting", async ({
  project,
}) => {
  await setupRun(project.cwd);
  await runWorkflow(
    {
      cwd: project.cwd,
      ui: scriptedUi([]).ui,
      signal: new AbortController().signal,
      tasksPath: "tasks.json",
    },
    recordOutput,
  );
  const saved = JSON.parse(await sessionFile(project.cwd, "run.json")) as RunReport;
  const ids = saved.tasks.flatMap((task) => (task.steps ?? []).map((step) => step.conversationId));
  expect(ids).toHaveLength(6);
  expect(ids.every((id) => typeof id === "string")).toBe(true);
  expect(new Set(ids).size).toBe(6);
  await verifyReconnection(project.cwd);
});

async function verifyReconnection(cwd: string): Promise<void> {
  const state = sessionView(cwd);
  await refreshSessionView(state);
  expect(state.report?.tasks[0]?.steps?.[0]?.conversation).toBeUndefined();
  if (!state.selection) throw new Error("Missing selection");
  state.selection.logs = true;
  await refreshSessionView(state);
  if (!state.report) throw new Error("Missing report");
  const text = taskBody(state.report, state.selection, { width: 100, height: 100 }).join("\n");
  expect(text).toContain("a/implementation: final result");
  expect(text).toContain("a/implementation: full output\nSecond line.");
  expect(text).toContain("a/testing: full output\nSecond line.");
  expect(text).not.toContain("b/implementation");
  expect(state.report.tasks[1]?.steps?.[0]?.conversation).toBeUndefined();
}

test("old and missing step logs leave results readable", async ({ project }) => {
  const state = sessionView(project.cwd);
  if (!state.selection) throw new Error("Missing selection");
  state.selection.logs = true;
  const report = missingLogsReport();
  await saveSessionFile(project.cwd, "run.json", JSON.stringify(report));
  await refreshSessionView(state);
  if (!state.report) throw new Error("Missing report");
  const text = taskBody(state.report, state.selection, { width: 100, height: 100 }).join("\n");
  expect(text).toContain("Implemented");
  expect(text).toContain("Verified");
  expect(text.match(/No log recorded for this step\./gu)).toHaveLength(2);
});

function missingLogsReport(): RunReport {
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    tasks: [
      {
        ...viewTask(),
        steps: [
          {
            id: "implementation",
            title: "Implementation",
            status: "completed",
            summary: "Implemented",
          },
          {
            id: "testing",
            title: "Tests",
            status: "completed",
            summary: "Verified",
            conversationId: "00000000-0000-0000-0000-000000000000",
          },
        ],
      },
    ],
  };
}
