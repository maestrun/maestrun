import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

test("the CLI version matches the package being released", async () => {
  const { createApp } = await import("./app.js");
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(createApp().version()).toBe(version);
});

test("the application can be imported and constructed without running CLI commands", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const exitCode = process.exitCode;
  try {
    const { createApp } = await import("./app.js");
    const app = createApp();
    expect(app.commands.map((command) => command.name())).toEqual([
      "init",
      "plan",
      "run",
      "sample",
      "template",
      "config",
      "doctor",
      "start",
      "plugin",
    ]);
    expect(createApp()).not.toBe(app);
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(listeners);
    expect(process.exitCode).toBe(exitCode);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
});
