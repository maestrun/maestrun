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

export function sessionCli(cwd: string, args: string[], terminal = true): Cli {
  const main = fileURLToPath(
    new URL(terminal ? "./terminal-cli.ts" : "../../src/main.ts", import.meta.url),
  );
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), main, ...args], {
    cwd,
    env: { ...process.env, HOME: os.homedir(), TERM: "xterm", FORCE_COLOR: "0" },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  return {
    send: (text) => void child.stdin.write(text),
    output: () => output,
    exited,
    kill: () => void child.kill("SIGTERM"),
    wait: async (text) => {
      await vi.waitFor(() => expect(output).toContain(text), { timeout: 5000 });
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
