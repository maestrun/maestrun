import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { createPlan } from "../../src/modules/planning/index.js";
import type { initialize } from "../../src/modules/workflow/index.js";

const mock = vi.hoisted(() => ({
  initialize: vi.fn<typeof initialize>(),
  createPlan: vi.fn<typeof createPlan>(),
  doctor: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../src/modules/planning/index.js", () => mock);
vi.mock("../../src/modules/workflow/index.js", () => mock);
vi.mock("../../src/modules/onboarding/index.js", async (original) => ({
  ...(await original<object>()),
  doctor: mock.doctor,
}));
const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

function tty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value });
}

function restoreProperty(target: object, name: string, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

beforeEach(() => {
  vi.resetModules();
  mock.initialize.mockReset();
  mock.initialize.mockResolvedValue();
  mock.createPlan.mockReset();
  mock.createPlan.mockResolvedValue();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = [process.execPath, "maestrun", "init"];
  process.exitCode = 0;
  tty(true);
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  restoreProperty(process.stdin, "isTTY", stdinDescriptor);
  restoreProperty(process.stdout, "isTTY", stdoutDescriptor);
  restoreProperty(process, "platform", platformDescriptor);
  vi.restoreAllMocks();
});

test("init invokes the guided experience and removes signal listeners", async () => {
  const listeners = process.listenerCount("SIGINT");
  await import("../../src/main.js");
  expect(mock.initialize).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: process.cwd(), quick: true }),
  );
  expect(process.listenerCount("SIGINT")).toBe(listeners);
  expect(process.exitCode).toBe(0);
});

test("plan invokes planning separately from initialization", async () => {
  process.argv = [process.execPath, "maestrun", "plan"];
  await import("../../src/main.js");
  expect(mock.createPlan).toHaveBeenCalledWith(expect.objectContaining({ cwd: process.cwd() }));
  expect(mock.initialize).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(0);
});

test("noninteractive initialization gives a concrete next action", async () => {
  tty(false);
  await import("../../src/main.js");
  expect(mock.initialize).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("interactive terminal"));
  expect(process.exitCode).toBe(1);
});

test("native Windows directs the user to WSL", async () => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  await import("../../src/main.js");
  expect(console.error).toHaveBeenCalledWith("Next: Run maestrun init inside WSL.");
});

test("executor errors show the message and next action", async () => {
  const { UserError } = await import("../../src/shared/errors.js");
  mock.initialize.mockRejectedValue(new UserError("Authentication required", "Run codex login"));
  await import("../../src/main.js");
  expect(console.error).toHaveBeenCalledWith("Next: Run codex login");
  expect(process.exitCode).toBe(1);
});

test("unexpected errors are reported without dumping their raw details", async () => {
  mock.initialize.mockRejectedValue(new Error("Sensitive upstream details"));
  await import("../../src/main.js");
  expect(console.error).not.toHaveBeenCalledWith(
    expect.stringContaining("Sensitive upstream details"),
  );
  expect(process.exitCode).toBe(1);
});

test("SIGINT cancels the active executor and exits with cancellation status", async () => {
  const { CancelError } = await import("../../src/shared/errors.js");
  mock.initialize.mockImplementation(async (input) => {
    process.emit("SIGINT");
    expect(input.signal.aborted).toBe(true);
    throw new CancelError();
  });
  await import("../../src/main.js");
  expect(console.log).toHaveBeenCalledWith("Cancelled.");
  expect(process.exitCode).toBe(130);
});

test("init --advanced bypasses quick setup", async () => {
  process.argv = [process.execPath, "maestrun", "init", "--advanced"];
  await import("../../src/main.js");
  expect(mock.initialize).toHaveBeenCalledWith(expect.objectContaining({ quick: false }));
});
