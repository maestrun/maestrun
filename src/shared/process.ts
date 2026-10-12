import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { CancelError, UserError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const KILL_GRACE_MS = 1000;
export type Command = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  onStdoutLine?: (line: string) => void;
}>;
export type CommandResult = Readonly<{
  code: number | null;
  stdout: string;
  stderr: string;
}>;
type Output = { stdout: string; stderr: string; bytes: number };

function timeoutError(): UserError {
  return new UserError("The executor timed out.", "Check the executor and retry the command.");
}

export function startProcess(command: Command): ChildProcessWithoutNullStreams {
  if (command.signal?.aborted) throw new CancelError();
  return spawn(command.executable, [...command.args], {
    cwd: command.cwd,
    env: command.env ?? process.env,
    stdio: "pipe",
    shell: false,
    detached: process.platform !== "win32",
    windowsHide: true,
  });
}

export function killProcess(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

export function monitorProcess(
  child: ChildProcessWithoutNullStreams,
  command: Command,
  fail: (error: Error) => void,
): () => void {
  let killTimer: NodeJS.Timeout | undefined;
  function stop(error: Error): void {
    fail(error);
    killProcess(child, "SIGTERM");
    killTimer ??= setTimeout(() => killProcess(child, "SIGKILL"), KILL_GRACE_MS);
  }
  const abort = (): void => stop(new CancelError());
  const timer = setTimeout(() => stop(timeoutError()), command.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  command.signal?.addEventListener("abort", abort, { once: true });
  return () => {
    clearTimeout(timer);
    command.signal?.removeEventListener("abort", abort);
    if (killTimer) {
      clearTimeout(killTimer);
      killProcess(child, "SIGKILL");
    }
  };
}

function processStartError(command: Command): UserError {
  return new UserError(
    `Could not start ${command.executable}.`,
    `Check that ${command.executable} is installed and on PATH, then retry the command.`,
  );
}

export function runCommand(command: Command): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = startProcess(command);
    const output: Output = { stdout: "", stderr: "", bytes: 0 };
    let failure: Error | undefined;
    const fail = (error: Error): void => {
      failure ??= error;
    };
    const cleanup = monitorProcess(child, command, fail);
    captureOutput(child, output, command.onStdoutLine);
    child.on("error", () => fail(processStartError(command)));
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") fail(processStartError(command));
    });
    child.on("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (output.bytes > MAX_OUTPUT_BYTES)
        reject(
          new UserError(
            "Executor output was too large.",
            "Reduce the requirements and retry the command.",
          ),
        );
      else resolve({ code, stdout: output.stdout, stderr: output.stderr });
    });
    child.stdin.end(command.input ?? "");
  });
}

function captureOutput(
  child: ChildProcessWithoutNullStreams,
  output: Output,
  onLine?: (line: string) => void,
): void {
  if (onLine) createInterface({ input: child.stdout }).on("line", onLine);
  for (const stream of ["stdout", "stderr"] as const) {
    child[stream].setEncoding("utf8");
    child[stream].on("data", (chunk: string) => collectOutput(output, { stream, chunk, child }));
  }
}

function collectOutput(
  output: Output,
  input: { stream: "stdout" | "stderr"; chunk: string; child: ChildProcessWithoutNullStreams },
): void {
  if (output.bytes > MAX_OUTPUT_BYTES) return;
  output.bytes += Buffer.byteLength(input.chunk);
  output[input.stream] += input.chunk;
  if (output.bytes > MAX_OUTPUT_BYTES) killProcess(input.child, "SIGKILL");
}
