import { expect } from "vitest";
import { runCommand } from "../../src/shared/process.js";
import { test } from "../helpers/project.js";

test("passes text and arguments literally, captures output, and returns exit status", async ({
  project,
}) => {
  const argument = "a; $(not-a-command) `not-a-command`";
  const result = await runCommand({
    executable: process.execPath,
    cwd: project.cwd,
    args: [
      "-e",
      "process.stdin.pipe(process.stdout); process.stderr.write(process.argv[1]); process.exitCode = 7",
      argument,
    ],
    input: "multiline\nrequirements",
    env: { PATH: project.bin },
  });
  expect(result).toEqual({ code: 7, stdout: "multiline\nrequirements", stderr: argument });
});

test("reports a missing executable without exposing its arguments", async ({ project }) => {
  await expect(
    runCommand({
      executable: "missing-maestrun-executor",
      cwd: project.cwd,
      args: ["sensitive-input"],
      env: { PATH: project.bin },
    }),
  ).rejects.toThrow("Could not start");
});

test("kills a timed-out executor", async ({ project }) => {
  await expect(
    runCommand({
      executable: process.execPath,
      cwd: project.cwd,
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 50,
    }),
  ).rejects.toThrow("timed out");
});

test("kills an interrupted executor", async ({ project }) => {
  const controller = new AbortController();
  const running = runCommand({
    executable: process.execPath,
    cwd: project.cwd,
    args: ["-e", "setInterval(() => {}, 1000)"],
    signal: controller.signal,
  });
  controller.abort();
  await expect(running).rejects.toThrow("Cancelled");
});

test("rejects an executor's excessive output", async ({ project }) => {
  await expect(
    runCommand({
      executable: process.execPath,
      cwd: project.cwd,
      args: ["-e", "process.stdout.write('x'.repeat(17 * 1024 * 1024))"],
    }),
  ).rejects.toThrow("too large");
});
