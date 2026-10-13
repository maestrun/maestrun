import chalk from "chalk";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "vitest";
import { viewTask } from "../../../tests/helpers/run-view.js";
import { taskFlowchart } from "./task-flowchart.js";

test.each(["failed", "refactor"] as const)(
  "terminal %s stays red without a repair arrow",
  (status) => {
    const level = chalk.level;
    chalk.level = 1;
    try {
      const task = {
        ...viewTask(),
        status,
        steps: [
          { id: "implementation", title: "Implementation", status: "completed" as const },
          { id: "testing", title: "Testing", status },
        ],
      };
      const output = taskFlowchart(task, { width: 40, height: 24 }).join("\n");
      expect(output).toContain("\x1b[31m┌");
      expect(stripVTControlCharacters(output)).toContain("Error");
      expect(output).not.toContain("┌──▶");
      expect(task.steps[1]?.status).toBe(status);
    } finally {
      chalk.level = level;
    }
  },
);
