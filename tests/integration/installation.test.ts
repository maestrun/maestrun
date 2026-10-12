import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const script = new URL("../../scripts/install.mjs", import.meta.url).href;

test("the installer rejects unsupported Node versions with a concrete next step", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `Object.defineProperty(process.versions, 'node', { value: '20.0.0' }); await import(${JSON.stringify(script)});`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Install a supported version");
});

test("the installer directs native Windows users to WSL before writing state", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `Object.defineProperty(process, 'platform', { value: 'win32' }); await import(${JSON.stringify(script)});`,
    ],
    { encoding: "utf8", cwd: fileURLToPath(new URL("../../", import.meta.url)) },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("wsl --install");
});
