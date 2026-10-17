import { expect, test } from "vitest";
import { parseTasks } from "./task-validation.js";
import { parseTaskDocument } from "./tasks.js";
import { taskDependencies } from "./task-dependencies.js";

const task = { id: "accept", title: "Accept", dependsOn: [], instructions: "Review." };
const repair = { ...task, id: "fix", repairFor: "accept" };

test("repair tasks gate their target without changing its definition", () => {
  const tasks = parseTasks({ version: 1, tasks: [task, repair] });
  expect(taskDependencies(tasks, task)).toEqual(["fix"]);
  expect(tasks[0]).toEqual(task);
  expect(taskDependencies(tasks, repair)).toEqual([]);
  expect(
    parseTaskDocument(
      "### Task accept: Accept\n- Depends on: none\n\nReview.\n\n### Task fix: Fix\n- Depends on: none\n- Repairs: accept\n\nRepair.",
    )[1]?.repairFor,
  ).toBe("accept");
});

test.each([
  { ...repair, repairFor: "missing" },
  { ...repair, repairFor: "fix" },
  { ...repair, dependsOn: ["accept"] },
  { ...repair, repairFor: false },
])("rejects unknown, self, cyclic and malformed repair links: %j", (invalid) => {
  expect(() => parseTasks({ version: 1, tasks: [task, invalid] })).toThrow();
});
