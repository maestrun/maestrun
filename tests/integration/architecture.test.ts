import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const SOURCE = fileURLToPath(new URL("../../src/", import.meta.url));
const MODULES = join(SOURCE, "modules");

async function productionFiles(): Promise<readonly string[]> {
  const paths = await readdir(SOURCE, { recursive: true });
  return paths
    .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
    .map((path) => join(SOURCE, path));
}

async function dependencies(path: string): Promise<readonly string[]> {
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest);
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith(".")) return [];
    return [resolve(dirname(path), specifier.text.replace(/\.js$/u, ".ts"))];
  });
}

test("capabilities remain flat and export every production file through their barrel", async () => {
  for (const capability of await readdir(MODULES)) {
    const directory = join(MODULES, capability);
    const entries = await readdir(directory, { withFileTypes: true });
    expect(
      entries.every((entry) => entry.isFile()),
      directory,
    ).toBe(true);
    const files = entries
      .filter((entry) => entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
      .map((entry) => join(directory, entry.name))
      .filter((path) => path !== join(directory, "index.ts"));
    expect([...(await dependencies(join(directory, "index.ts")))].sort()).toEqual(files.sort());
  }
});

test("capability consumers use barrels and shared layers do not depend on capabilities", async () => {
  for (const path of await productionFiles()) {
    for (const dependency of await dependencies(path)) {
      if (!dependency.startsWith(`${MODULES}/`) || dirname(path) === dirname(dependency)) continue;
      expect(dependency, path).toMatch(/\/index\.ts$/u);
      const layer = dirname(path);
      for (const name of ["shared", "contracts", "config"])
        expect(layer.startsWith(join(SOURCE, name)), path).toBe(false);
    }
  }
});

function visit(
  path: string,
  graph: ReadonlyMap<string, readonly string[]>,
  state: { active: Set<string>; visited: Set<string> },
): void {
  expect(
    state.active.has(path),
    `Circular dependency: ${[...state.active, path].join(" -> ")}`,
  ).toBe(false);
  if (state.visited.has(path)) return;
  state.active.add(path);
  for (const dependency of graph.get(path) ?? []) visit(dependency, graph, state);
  state.active.delete(path);
  state.visited.add(path);
}

test("production imports and exports have no circular dependencies", async () => {
  const graph = new Map<string, readonly string[]>();
  for (const path of await productionFiles()) graph.set(path, await dependencies(path));
  const state = { active: new Set<string>(), visited: new Set<string>() };
  for (const path of graph.keys()) visit(path, graph, state);
});
