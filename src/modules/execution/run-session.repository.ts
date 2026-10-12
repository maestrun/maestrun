import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ensureStateDirectory, validateStateDirectory } from "../../shared/project-state.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { UserError } from "../../shared/errors.js";
import { isRecord } from "../../contracts/workflow.js";
import type { RunReport } from "../../contracts/run.js";

export type RunSession = {
  id: string;
  pid: number;
  startedAt: string;
  status: "running" | "completed" | "cancelled" | "failed";
  error?: string;
  nextAction?: string;
};

export async function sessionFile(cwd: string, name: string): Promise<string> {
  await validateStateDirectory(cwd);
  return (await snapshotFile(join(cwd, ".maestrun", name))).content;
}

export async function saveSessionFile(cwd: string, name: string, content: string): Promise<void> {
  await ensureStateDirectory(cwd);
  const path = join(cwd, ".maestrun", name);
  await atomicWrite(path, content, await snapshotFile(path));
}

export async function readSession(cwd: string): Promise<RunSession | undefined> {
  const content = await sessionFile(cwd, "session.json");
  if (!content) return undefined;
  const value: unknown = JSON.parse(content);
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !Number.isSafeInteger(value.pid) ||
    typeof value.pid !== "number" ||
    value.pid <= 0 ||
    typeof value.startedAt !== "string" ||
    !["running", "completed", "cancelled", "failed"].includes(String(value.status))
  )
    throw new UserError("Invalid execution session.", "Inspect .maestrun/session.json.");
  return value as RunSession;
}

export function workerAlive(session: RunSession): boolean {
  try {
    process.kill(session.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function resumableSession(cwd: string): Promise<RunSession | undefined> {
  let session = await readSession(cwd);
  if (!session) return undefined;
  if (session.status === "running" && !workerAlive(session)) session = await readSession(cwd);
  if (!session) return undefined;
  if (session.status === "running") {
    if (!workerAlive(session)) throw stoppedSession();
    return session;
  }
  return (await sessionFile(cwd, "background")) === session.id ? session : undefined;
}

export function stoppedSession(): UserError {
  return new UserError(
    "The execution worker stopped unexpectedly.",
    "Inspect .maestrun/run.log and run --status. Confirm executors stopped before removing .maestrun/session.json, .maestrun/session.lock and .maestrun/run.lock.",
  );
}

export async function claimSession(cwd: string): Promise<void> {
  await ensureStateDirectory(cwd);
  try {
    await mkdir(join(cwd, ".maestrun/session.lock"));
  } catch {
    throw new UserError(
      "Could not acquire the execution session lock.",
      "Run maestrun again to reconnect. If the worker crashed, inspect .maestrun/run.log before removing .maestrun/session.lock.",
    );
  }
}

export async function releaseSession(cwd: string): Promise<void> {
  await validateStateDirectory(cwd);
  await rm(join(cwd, ".maestrun/session.lock"), { recursive: true, force: true });
}

export async function sessionReport(
  cwd: string,
  session: RunSession,
): Promise<RunReport | undefined> {
  const content = await sessionFile(cwd, "run.json");
  if (!content) return undefined;
  const report = JSON.parse(content) as RunReport;
  return report.startedAt >= session.startedAt ? report : undefined;
}
