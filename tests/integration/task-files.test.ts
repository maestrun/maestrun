import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadTasks } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";

const API =
  "# Task api: Implement API\n\n- Depends on: none\n- Target: backend\n\n## Scope\n\nImplement the API.";
const UI = "# Task ui: Connect UI\n\n- Depends on: api\n\n## Verification\n\nCheck the UI.";
const INDEX = "# Tasks\n\n- [x] [API](<details/api%20task.md>)\n- [ ] [UI](details/ui.md)";

async function writeTasks(cwd: string): Promise<void> {
  await mkdir(join(cwd, "details"));
  await writeFile(join(cwd, "plan.md"), "[tasks.md](tasks.md)");
  await writeFile(join(cwd, "tasks.md"), INDEX);
  await writeFile(join(cwd, "details/api task.md"), API);
  await writeFile(join(cwd, "details/ui.md"), UI);
}

test("loads linked task files, cross-file dependencies and subsequent edits", async ({
  project,
}) => {
  await writeTasks(project.cwd);
  const tasks = await loadTasks(project.cwd, "plan.md");
  expect(tasks).toEqual([
    {
      id: "api",
      title: "Implement API",
      dependsOn: [],
      target: "backend",
      instructions: "## Scope\n\nImplement the API.",
    },
    {
      id: "ui",
      title: "Connect UI",
      dependsOn: ["api"],
      instructions: "## Verification\n\nCheck the UI.",
    },
  ]);
  await writeFile(
    join(project.cwd, "details/ui.md"),
    UI.replace("Check the UI.", "Updated verification."),
  );
  expect((await loadTasks(project.cwd, "tasks.md"))[1]?.instructions).toContain(
    "Updated verification.",
  );
});

test.for([
  ["details/ui.md", UI.replace("Task ui:", "Task api:"), "duplicate task ids"],
  ["details/api task.md", API.replace("Depends on: none", "Depends on: ui"), "cyclic dependencies"],
  [
    "details/ui.md",
    UI.replace("Depends on: api", "Depends on: missing"),
    "unknown or self dependency",
  ],
  ["tasks.md", `${INDEX}\n- [ ] [Again](details/ui.md)`, "repeated task document links"],
  ["details/ui.md", "[tasks.md](../tasks.md)", "cyclic or repeated task document links"],
  ["tasks.md", `${INDEX}\n- [ ] [Missing](missing.md)`, "Could not open missing.md"],
])("rejects invalid linked tasks: %j", async ([file, content, error], { project }) => {
  await writeTasks(project.cwd);
  await writeFile(join(project.cwd, file ?? ""), content ?? "");
  await expect(loadTasks(project.cwd, "plan.md")).rejects.toThrow(error);
});
