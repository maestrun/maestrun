import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadExtensions } from "../../src/modules/plugins/index.js";
import { snapshotFile } from "../../src/shared/atomic.js";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { sessionCli } from "../helpers/session-cli.js";

const PLUGIN = `import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./executed', import.meta.url), 'loaded');
export default { apiVersion: 1, name: 'audit', stages: { 'custom:Audit': () => 'done' } };`;

test("unapproved extensions cannot execute top-level code", async ({ project }) => {
  await writeFile(join(project.cwd, "audit.mjs"), PLUGIN);
  await expect(loadExtensions(project.cwd, ["./audit.mjs"])).rejects.toThrow("explicit approval");
  expect((await snapshotFile(join(project.cwd, "executed"))).exists).toBe(false);
  expect(await loadExtensions(project.cwd, [])).toEqual([]);
});

test("project configuration cannot authorize plugins in a real worker", async ({ project }) => {
  await setupPlugin(project.cwd);
  const config = join(project.cwd, ".maestrun/config.json");
  const value = JSON.parse(await readFile(config, "utf8"));
  await writeFile(config, JSON.stringify({ ...value, trustPlugins: true }));
  const result = await run(project.cwd);
  expect(result.code).toBe(1);
  expect(result.output).toContain("explicit approval");
  expect((await snapshotFile(join(project.cwd, "executed"))).exists).toBe(false);
});

test("CLI approval reaches the worker and completed runs need no new approval", async ({
  project,
}) => {
  await setupPlugin(project.cwd);
  expect((await run(project.cwd, ["--trust-plugins"])).code).toBe(0);
  expect(await readFile(join(project.cwd, "executed"), "utf8")).toBe("loaded");
  expect(await readFile(join(project.cwd, ".maestrun/run.json"), "utf8")).toContain("plugin:audit");
  await writeFile(join(project.cwd, "audit.mjs"), "throw new Error('must not load');");
  expect((await run(project.cwd)).code).toBe(0);
});

test("approval is not remembered after plugin content changes", async ({ project }) => {
  await setupPlugin(project.cwd);
  await loadExtensions(project.cwd, ["./audit.mjs"], true);
  await writeFile(join(project.cwd, "executed"), "unchanged");
  await writeFile(join(project.cwd, "audit.mjs"), PLUGIN.replace("'loaded'", "'changed'"));
  const result = await run(project.cwd);
  expect(result.code).toBe(1);
  expect(result.output).toContain("explicit approval");
  expect(await readFile(join(project.cwd, "executed"), "utf8")).toBe("unchanged");
});

async function setupPlugin(cwd: string): Promise<void> {
  await setupRun(cwd, {
    version: 1,
    stages: [
      { id: "planning", executor: "codex", model: "test" },
      { id: "custom:Audit", executor: "codex", model: "fallback" },
    ],
    plugins: ["./audit.mjs"],
  });
  await writeFile(join(cwd, "audit.mjs"), PLUGIN);
}

async function run(
  cwd: string,
  extra: string[] = [],
): Promise<{ code: number | null; output: string }> {
  const cli = sessionCli(cwd, ["run", "--tasks", "tasks.json", ...extra], false);
  try {
    return { code: await cli.exited, output: cli.output() };
  } finally {
    cli.kill();
  }
}
