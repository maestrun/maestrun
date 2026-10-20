import type { RunSessionOptions } from "./task-selection.js";
import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openRunLog } from "./run-log.js";
import { UserError } from "../../shared/errors.js";
import { claimSession, readSession, releaseSession } from "./run-session.repository.js";
import type { RunSession } from "./run-session.repository.js";

export async function startRunSession(
  cwd: string,
  tasksPath: string,
  options: boolean | RunSessionOptions = false,
): Promise<RunSession> {
  await claimSession(cwd);
  try {
    await spawnWorker(
      cwd,
      tasksPath,
      typeof options === "boolean" ? { trustPlugins: options } : options,
    );
    const session = await readSession(cwd);
    if (!session) throw new Error("Missing worker session");
    return session;
  } catch (error) {
    await releaseSession(cwd);
    throw error;
  }
}

async function spawnWorker(
  cwd: string,
  tasksPath: string,
  options: RunSessionOptions,
): Promise<void> {
  const log = await openRunLog(cwd);
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  try {
    const child = fork(
      new URL(`../../run-worker.${extension}`, import.meta.url),
      [
        randomUUID(),
        tasksPath,
        options.trustPlugins ? "--trust-plugins" : "",
        JSON.stringify({ only: options.only, skip: options.skip }),
      ],
      {
        cwd,
        detached: true,
        stdio: ["ignore", log.fd, log.fd, "ipc"],
      },
    );
    await ready(child);
    child.unref();
  } finally {
    await log.close();
  }
}

function ready(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (): void => {
      cleanup();
      reject(
        new UserError(
          "Could not start the execution worker.",
          "Inspect .maestrun/run.log and retry.",
        ),
      );
    };
    const started = (): void => {
      cleanup();
      resolve();
    };
    const cleanup = (): void => {
      child.removeListener("error", fail);
      child.removeListener("exit", fail);
      child.removeListener("message", started);
    };
    child.once("error", fail);
    child.once("exit", fail);
    child.once("message", started);
  });
}
