import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { test } from "../helpers/project.js";
import { viewReport, viewState, viewTerminal } from "../helpers/run-view.js";
import { loadLayout } from "../../src/config/index.js";
import { DEFAULT_LAYOUT } from "../../src/contracts/layout.js";
import { maestrunHome } from "../../src/shared/home.js";
import { createRunView } from "../../src/modules/execution/index.js";

async function save(directory: string, value: unknown): Promise<string> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, "layout.json");
  await writeFile(path, JSON.stringify(value));
  return path;
}

test("merges project settings over global settings and built-in defaults", async ({ project }) => {
  expect(loadLayout(project.cwd)).toEqual(DEFAULT_LAYOUT);
  const global = await save(maestrunHome(), {
    columns: [{ id: "task", width: 10 }, { id: "name" }],
    flowchart: { position: "left", width: 40, visible: false },
  });
  const before = await readFile(global, "utf8");
  expect(loadLayout(project.cwd).columns?.[1]?.width).toBe("auto");
  await save(join(project.cwd, ".maestrun"), { flowchart: { width: 50 } });
  expect(loadLayout(project.cwd)).toMatchObject({
    columns: [
      { id: "task", width: 10 },
      { id: "name", width: "auto" },
    ],
    flowchart: { position: "left", width: 50, visible: false, height: "auto" },
  });
  await save(join(project.cwd, ".maestrun"), { columns: [{ id: "status", width: 15 }] });
  expect(loadLayout(project.cwd).columns).toEqual([{ id: "status", width: 15 }]);
  expect(loadLayout(project.bin).flowchart.width).toBe(40);
  expect(await readFile(global, "utf8")).toBe(before);
});

const invalidLayouts = [
  null,
  [],
  { unknown: true },
  { columns: [] },
  { columns: [null] },
  { columns: [{ id: "oops" }] },
  { columns: [{ id: "name", width: 0 }] },
  { columns: [{ id: "name", width: 1.5 }] },
  { columns: [{ id: "name", width: null }] },
  { columns: [{ id: "name" }, { id: "name" }] },
  { flowchart: null },
  { flowchart: { visible: "false" } },
  { flowchart: { position: ["left"] } },
  { flowchart: { position: "center" } },
  { flowchart: { width: 19 } },
  { flowchart: { height: 8 } },
];

test("rejects invalid layouts with their path", async ({ project }) => {
  for (const value of invalidLayouts) {
    const path = await save(join(project.cwd, ".maestrun"), value);
    expect(() => loadLayout(project.cwd)).toThrow(path);
  }
});

test("reports malformed or unreadable global JSON without changing it", async ({ project }) => {
  const path = await save(maestrunHome(), {});
  await writeFile(path, "{");
  expect(() => loadLayout(project.cwd)).toThrow(`Invalid layout in ${path}`);
  expect(await readFile(path, "utf8")).toBe("{");
  const local = join(project.cwd, ".maestrun", "layout.json");
  await writeFile(path, "{}");
  await mkdir(local, { recursive: true });
  expect(() => loadLayout(project.cwd)).toThrow(`Could not read layout file ${local}`);
});

test("real views apply defaults once, retain toggles on reopening and resize", async ({
  project,
}) => {
  vi.stubEnv("TERM", "xterm");
  await save(maestrunHome(), { flowchart: { visible: false } });
  await save(join(project.cwd, ".maestrun"), {
    columns: [
      { id: "name", width: "auto" },
      { id: "task", width: 10 },
    ],
    flowchart: { position: "left", width: 30 },
  });
  const terminal = viewTerminal();
  const selection = viewState();
  const options = { ...terminal, selection };
  const view = createRunView(viewReport(), project.cwd, options);
  try {
    expect(terminal.frames.at(-1)).not.toContain("[ Flow ]");
    terminal.input.emit("keypress", "f", { name: "f" });
    expect(terminal.frames.at(-1)).toContain("[ Flow ]");
    terminal.output.columns = 60;
    terminal.output.emit("resize");
    expect(terminal.frames.at(-1)).not.toContain("[ Flow ]");
  } finally {
    view?.close();
  }
  const reopened = createRunView(viewReport(), project.cwd, options);
  expect(selection.flow).toBe(true);
  reopened?.close();
});

test("invalid configuration leaves the terminal untouched; plain logs ignore it", async ({
  project,
}) => {
  vi.stubEnv("TERM", "xterm");
  await save(join(project.cwd, ".maestrun"), { columns: [] });
  const terminal = viewTerminal();
  expect(() => createRunView(viewReport(), project.cwd, terminal)).toThrow("columns");
  expect(terminal.frames).toEqual([]);
  expect(terminal.input.setRawMode).not.toHaveBeenCalled();
  terminal.output.isTTY = false;
  expect(createRunView(viewReport(), project.cwd, terminal)).toBeUndefined();
});
