import type { ChildProcess, ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { expect, vi } from "vitest";
import { readSession, saveSessionFile } from "../../src/modules/execution/index.js";

type Cli = {
  send: (text: string) => void;
  wait: (text: string) => Promise<void>;
  output: () => string;
  exited: Promise<number | null>;
  kill: () => void;
};

export function sessionCli(
  cwd: string,
  args: string[],
  options: boolean | { selectAll: boolean } = true,
): Cli {
  const terminal = typeof options === "boolean" ? options : true;
  const main = fileURLToPath(
    new URL(terminal ? "./terminal-cli.ts" : "../../src/main.ts", import.meta.url),
  );
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), main, ...args], {
    cwd,
    env: { ...process.env, HOME: os.homedir(), TERM: "xterm", FORCE_COLOR: "0" },
    stdio: "pipe",
  });
  const output = captureOutput(child, typeof options === "boolean" ? true : options.selectAll);
  const exited = childExit(child);
  return {
    send: (text) => void child.stdin.write(text),
    output,
    exited,
    kill: () => void child.kill("SIGTERM"),
    wait: async (text) => {
      await vi.waitFor(() => expect(output()).toContain(text), { timeout: 5000 });
    },
  };
}

export async function stopSession(cwd: string): Promise<void> {
  const session = await readSession(cwd);
  if (session?.status !== "running") return;
  await saveSessionFile(cwd, "cancel", session.id);
  await vi.waitFor(async () => expect((await readSession(cwd))?.status).not.toBe("running"), {
    timeout: 5000,
  });
}

function childExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
}

function captureOutput(child: ChildProcessWithoutNullStreams, selectAll: boolean): () => string {
  let output = "";
  const receive = (chunk: Buffer): void => {
    output += chunk.toString();
    if (selectAll && output.includes("Choose tasks for this run")) {
      selectAll = false;
      child.stdin.write("\r");
    }
  };
  child.stdout.on("data", receive);
  child.stderr.on("data", receive);
  return () => output;
}
