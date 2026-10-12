import type { Command } from "../../shared/process.js";
import { killProcess, monitorProcess, startProcess } from "../../shared/process.js";
import { isRecord } from "../../contracts/workflow.js";
import { executorFailure, UserError } from "../../shared/errors.js";

const MAX_RPC_BYTES = 4 * 1024 * 1024;
type Frames = { buffer: Buffer; bytes: number };

function rpcError(): UserError {
  return new UserError(
    "Copilot discovery is unavailable.",
    "Run copilot update or enter an exact model identifier.",
  );
}

function receive(state: Frames, chunk: Buffer, resolve: (value: unknown) => void): void {
  state.bytes += chunk.length;
  if (state.bytes > MAX_RPC_BYTES) throw rpcError();
  state.buffer = Buffer.concat([state.buffer, chunk]);
  while (state.buffer.length) {
    const boundary = state.buffer.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    const header = state.buffer.subarray(0, boundary).toString();
    const match = /^Content-Length: (\d+)$/imu.exec(header);
    if (!match) throw rpcError();
    const length = Number(match[1]);
    if (length > MAX_RPC_BYTES) throw rpcError();
    const end = boundary + 4 + length;
    if (state.buffer.length < end) return;
    const value: unknown = JSON.parse(state.buffer.subarray(boundary + 4, end).toString());
    state.buffer = state.buffer.subarray(end);
    if (!isRecord(value)) throw rpcError();
    if (value.id !== 1) continue;
    if (isRecord(value.error))
      throw executorFailure("GitHub Copilot", String(value.error.message ?? ""));
    if (!("result" in value)) throw rpcError();
    resolve(value.result);
  }
}

export async function copilotRequest(
  method: "auth.getStatus" | "models.list",
  input: Readonly<{ cwd: string; signal: AbortSignal }>,
): Promise<unknown> {
  const command: Command = {
    ...input,
    executable: "copilot",
    args: ["--headless", "--stdio", "--no-auto-update", "--log-level", "error"],
    timeoutMs: 10000,
  };
  const child = startProcess(command);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let cleanup = (): void => {};
  try {
    return await new Promise((resolve, reject) => {
      cleanup = monitorProcess(child, command, reject);
      listen(child, { resolve, reject });
      const message = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} });
      child.stdin.write(`Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`);
    });
  } finally {
    cleanup();
    killProcess(child, "SIGKILL");
    await closed;
  }
}

function listen(
  child: ReturnType<typeof startProcess>,
  pending: { resolve: (value: unknown) => void; reject: (error: Error) => void },
): void {
  const state: Frames = { buffer: Buffer.alloc(0), bytes: 0 };
  child.on("error", () => pending.reject(rpcError()));
  child.on("close", () => pending.reject(rpcError()));
  child.stdin.on("error", () => pending.reject(rpcError()));
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    try {
      receive(state, chunk, pending.resolve);
    } catch (error) {
      pending.reject(error instanceof UserError ? error : rpcError());
    }
  });
}
