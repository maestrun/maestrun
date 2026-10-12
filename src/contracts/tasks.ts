export type Task = Readonly<{
  id: string;
  title: string;
  instructions: string;
  dependsOn: readonly string[];
  target?: "frontend" | "backend";
}>;

export const TASK_FORMAT = [
  "Write runnable tasks directly in Markdown, without JSON or an maestrun-tasks code block.",
  "Under ## Tasks, use this format for each task:",
  "### Task task-1: Short title\n\n- Depends on: none\n- Target: frontend\n\nScope, acceptance criteria and verification commands.",
  "Use unique ids (letters, digits, underscores or hyphens). Depends on is required: none or comma-separated task ids; no cycles. Target is optional: frontend or backend only.",
  "Put metadata immediately after the task heading. The remaining Markdown is the task instructions; use level 4 or deeper headings for scope, acceptance criteria and tests. End tasks with the next task heading or a level 1 or 2 section.",
  "Each task runs all configured stages after planning in order. Specify relevant unit, integration and/or E2E suites for Tests, and implementation scope and acceptance criteria for QA review.",
  "Tasks sharing files or resources must depend on one another; independent tasks may run concurrently.",
].join("\n");
