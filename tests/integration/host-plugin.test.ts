import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { exportPlugin } from "../../src/modules/plugins/index.js";
import { test } from "../helpers/project.js";

test("exports a discoverable bundle for both hosts without overwriting existing directories", async ({
  project,
}) => {
  const directory = join(project.cwd, "plugin export");
  expect(await exportPlugin(directory)).toContain("codex plugin marketplace add");
  const marketplace: unknown = JSON.parse(
    await readFile(join(directory, ".agents/plugins/marketplace.json"), "utf8"),
  );
  expect(marketplace).toMatchObject({
    name: "maestrun-local",
    plugins: [{ source: { path: "./maestrun" } }],
  });
  for (const host of ["codex", "claude"]) {
    const manifest: unknown = JSON.parse(
      await readFile(join(directory, `maestrun/.${host}-plugin/plugin.json`), "utf8"),
    );
    expect(manifest).toMatchObject({ name: "maestrun", skills: "./skills/" });
  }
  expect(await readFile(join(directory, "maestrun/skills/maestrun/SKILL.md"), "utf8")).toContain(
    "maestrun run --dry-run",
  );
  await writeFile(join(directory, "user.txt"), "keep");
  await expect(exportPlugin(directory)).rejects.toThrow("Could not create plugin directory");
  expect(await readFile(join(directory, "user.txt"), "utf8")).toBe("keep");
});
