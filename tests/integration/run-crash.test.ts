import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { readSession, workerAlive } from "../../src/modules/execution/index.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli } from "../helpers/session-cli.js";
import { test } from "../helpers/project.js";

const EXPECTED_CALLS = [
  "a:custom:Write",
  "a:custom:Verify",
  "b:custom:Write",
  "b:custom:Verify",
  "b:custom:Verify",
  "c:custom:Write",
  "c:custom:Verify",
];

const PLUGIN = `
import { appendFileSync, existsSync, unlinkSync } from 'node:fs';
function execute({ task, stage }) {
  appendFileSync('calls.log', task.id + ':' + stage.id + '\\n');
  if (task.id === 'b' && stage.id === 'custom:Verify' && existsSync('.crash-once')) {
    unlinkSync('.crash-once');
    process.exit(77);
  }
  return 'Done';
}
export default { apiVersion: 1, name: 'crash-test', stages: {
  'custom:Write': execute, 'custom:Verify': execute
} };
`;

test("a hard-crash checkpoint survives stale-lock cleanup and resumes without replaying completed steps", async ({
  project,
}) => {
  await setupRun(project.cwd, {
    version: 1,
    stages: [
      { id: "planning", executor: "codex", model: "test" },
      { id: "custom:Write", executor: "codex", model: "test" },
      { id: "custom:Verify", executor: "codex", model: "test" },
    ],
    plugins: ["./crash.mjs"],
  });
  await writeFile(join(project.cwd, "crash.mjs"), PLUGIN);
  await writeFile(join(project.cwd, ".crash-once"), "");
  await crashAndClearLocks(project.cwd);
  const next = sessionCli(project.cwd, ["run", "--tasks", "tasks.json", "--trust-plugins"], false);
  try {
    expect(await next.exited).toBe(0);
    expect((await readFile(join(project.cwd, "calls.log"), "utf8")).trim().split("\n")).toEqual(
      EXPECTED_CALLS,
    );
  } finally {
    next.kill();
  }
});

async function crashAndClearLocks(cwd: string): Promise<void> {
  const first = sessionCli(cwd, ["run", "--tasks", "tasks.json", "--trust-plugins"], false);
  try {
    expect(await first.exited).toBe(1);
    expect(first.output()).toContain("worker stopped unexpectedly");
    const session = await readSession(cwd);
    if (!session) throw new Error("Missing crash session");
    expect(workerAlive(session)).toBe(false);
    // The test plugin runs in the worker and spawns no orphan executors.
    for (const path of ["session.json", "session.lock", "run.lock"])
      await rm(join(cwd, ".maestrun", path), { recursive: true, force: true });
  } finally {
    first.kill();
  }
}
