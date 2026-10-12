import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { isRecord } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";
import { startProcess, monitorProcess, killProcess } from "../../shared/process.js";
import type { Command } from "../../shared/process.js";

export type ModelProcess = {
  done: Promise<string>;
  send: (value: unknown) => void;
  resolve: (text: string) => void;
  fail: (error: Error) => void;
  close: () => Promise<void>;
};

export function taskModelProcess(
  command: Command,
  receive: (value: Record<string, unknown>) => void,
  usage?: (value: Record<string, unknown>) => void,
): ModelProcess {
  const result = completion();
  const child = startProcess(command);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const fail = (error: Error): void => result.reject(error);
  const cleanup = monitorProcess(child, command, fail);
  const lines = listen(child, { receive, usage }, fail);
  child.on("error", () => fail(executorFailure(command.executable, "")));
  child.on("close", () => fail(executorFailure(command.executable, "")));
  child.stdin.on("error", () => fail(executorFailure(command.executable, "")));
  child.stderr.resume();
  return {
    done: result.promise,
    fail,
    resolve: result.resolve,
    send: (value) => {
      child.stdin.write(`${JSON.stringify(value)}\n`);
    },
    close: async () => {
      lines.close();
      cleanup();
      killProcess(child, "SIGKILL");
      await closed;
    },
  };
}

function completion(): {
  promise: Promise<string>;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function listen(
  child: ChildProcessWithoutNullStreams,
  handlers: {
    receive: (value: Record<string, unknown>) => void;
    usage: ((value: Record<string, unknown>) => void) | undefined;
  },
  fail: (error: Error) => void,
): ReturnType<typeof createInterface> {
  const lines = createInterface({ input: child.stdout });
  let bytes = 0;
  lines.on("line", (line) => {
    try {
      bytes += Buffer.byteLength(line);
      if (bytes > 16 * 1024 * 1024) throw new Error("Model output too large");
      const value: unknown = JSON.parse(line);
      if (!isRecord(value)) throw new Error("Invalid model event");
      handlers.usage?.(value);
      handlers.receive(value);
    } catch {
      fail(new UserError("Invalid task model output.", "Update the executor and retry."));
    }
  });
  return lines;
}
