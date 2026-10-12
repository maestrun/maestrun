import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { loadTasks, parseTaskDocument } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";

const MARKDOWN = `# Implementation tasks

### Task api: Implement API

- Depends on: none
- Target: backend

Implement the endpoint.

#### Acceptance criteria

- [ ] Invalid inputs are rejected.

#### Tests

Run \`npm test\`.

### Task ui: Connect UI

- Depends on: api
- Target: frontend

Cover loading and error states.

## Verification

This section belongs to the plan.
`;

test.for(["\n", "\r\n"])(
  "reads Markdown tasks and preserves instructions with %j newlines",
  async (newline, { project }) => {
    await writeFile(join(project.cwd, "tasks.md"), MARKDOWN.replaceAll("\n", newline));
    const tasks = await loadTasks(project.cwd, "tasks.md");
    expect(tasks).toEqual([
      {
        id: "api",
        title: "Implement API",
        dependsOn: [],
        target: "backend",
        instructions:
          "Implement the endpoint.\n\n#### Acceptance criteria\n\n- [ ] Invalid inputs are rejected.\n\n#### Tests\n\nRun `npm test`.",
      },
      {
        id: "ui",
        title: "Connect UI",
        dependsOn: ["api"],
        target: "frontend",
        instructions: "Cover loading and error states.",
      },
    ]);
  },
);

test.for(["```", "~~~~"])("ignores task headings in %s code examples", (fence) => {
  const example = `${fence}md\n### Task fake: Example\n- Depends on: missing\n${fence}`;
  const tasks = parseTaskDocument(MARKDOWN.replace("Run `npm test`.", example));
  expect(tasks).toHaveLength(2);
  expect(tasks[0]?.instructions).toContain(example);
});

test.for([
  MARKDOWN.replace("- Depends on: none", ""),
  MARKDOWN.replace("- Depends on: none", "- Depends on: ui"),
  MARKDOWN.replace("- Depends on: api", "- Depends on: missing"),
  MARKDOWN.replace("- Depends on: api", "- Depends on: ui"),
  MARKDOWN.replace("- Depends on: api", "- Depends on: api,"),
  MARKDOWN.replace("- Target: backend", "- Target: both"),
  MARKDOWN.replace("- Target: backend", "- Target:"),
  MARKDOWN.replace("- Target: backend", "- Target: backend\n- Target: frontend"),
  MARKDOWN.replace("Task ui:", "Task api:"),
  MARKDOWN.replace("Cover loading and error states.", ""),
  MARKDOWN.replace("Task ui:", "Task ../ui:"),
  `${MARKDOWN}\n\`\`\`maestrun-tasks\n{}\n\`\`\``,
])("rejects invalid Markdown before execution: %j", (content) => {
  expect(() => parseTaskDocument(content)).toThrow("Invalid task plan");
});

test("follows tasks.md links relative to the plan and rejects cycles", async ({ project }) => {
  await mkdir(join(project.cwd, "Planning #1"));
  await writeFile(join(project.cwd, "plan.md"), "[tasks.md](<Planning%20%231/tasks.md>)");
  await writeFile(join(project.cwd, "Planning #1/tasks.md"), MARKDOWN);
  expect(await loadTasks(project.cwd, "plan.md")).toEqual(parseTaskDocument(MARKDOWN));
  await writeFile(join(project.cwd, "Planning #1/tasks.md"), "[tasks.md](../plan.md)");
  await expect(loadTasks(project.cwd, "plan.md")).rejects.toThrow(
    "cyclic or repeated task document links",
  );
});

test.for([
  "[tasks.md](one.md)\n[tasks.md](two.md)",
  "[tasks.md](%broken)",
  "```md\n[tasks.md](tasks.md)\n```",
])("rejects ambiguous, invalid or fenced task links: %j", async (content, { project }) => {
  await writeFile(join(project.cwd, "plan.md"), content);
  await expect(loadTasks(project.cwd, "plan.md")).rejects.toThrow("Invalid task plan");
});
