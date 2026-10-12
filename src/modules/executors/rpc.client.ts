import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { isRecord } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";

type Pending = Readonly<{
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>;
export type Rpc = Readonly<{
  request: (method: string, params: Readonly<Record<string, unknown>>) => Promise<unknown>;
  notify: (method: string) => void;
  fail: (error: Error) => void;
  close: () => void;
}>;

function rpcError(): UserError {
  return new UserError(
    "Codex model discovery is unavailable.",
    "Update Codex or enter an explicit model identifier.",
  );
}

function receive(line: string, pending: Map<number, Pending>): void {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw rpcError();
  if (typeof value.id !== "number") return;
  const request = pending.get(value.id);
  if (!request) return;
  pending.delete(value.id);
  if ("error" in value) request.reject(rpcError());
  else if ("result" in value) request.resolve(value.result);
  else request.reject(rpcError());
}

export function connectRpc(child: ChildProcessWithoutNullStreams): Rpc {
  const pending = new Map<number, Pending>();
  let sequence = 0;
  let failure: Error | undefined;
  function fail(error: Error): void {
    failure ??= error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  const close = listen(child, pending, fail);
  function request(method: string, params: Readonly<Record<string, unknown>>): Promise<unknown> {
    if (failure) return Promise.reject(failure);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  return {
    request,
    fail,
    notify: (method) => {
      child.stdin.write(`${JSON.stringify({ method })}\n`);
    },
    close: () => {
      close();
      fail(rpcError());
    },
  };
}

function listen(
  child: ChildProcessWithoutNullStreams,
  pending: Map<number, Pending>,
  fail: (error: Error) => void,
): () => void {
  const lines = createInterface({ input: child.stdout });
  child.on("error", () => fail(rpcError()));
  child.on("close", () => fail(rpcError()));
  child.stdin.on("error", () => fail(rpcError()));
  child.stderr.resume();
  lines.on("line", (line) => {
    try {
      receive(line, pending);
    } catch {
      fail(rpcError());
    }
  });
  return () => lines.close();
}
