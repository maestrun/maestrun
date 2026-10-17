import type { Stage, StageId } from "./workflow.js";

export type Task = Readonly<{
  id: string;
  title: string;
  instructions: string;
  dependsOn: readonly string[];
  target?: "frontend" | "backend";
  steps?: readonly StageId[];
  parentId?: string;
  repairFor?: string;
  agents?: Readonly<Partial<Record<StageId, string>>>;
  agentAssignments?: Readonly<Partial<Record<StageId, Stage>>>;
}>;

export const TASK_FORMAT = [
  "Write runnable tasks directly in Markdown, without JSON or an maestrun-tasks code block.",
  "Always include runnable tasks, including when producing PRDs or technical specifications. Maestrun generates a - [ ] task-id: title checklist in plan.md for progress reporting; never claim completion during planning.",
  "Under ## Tasks, use this format for each task:",
  "### Task task-1: Short title\n\n- Depends on: none\n- Target: frontend\n\nScope, acceptance criteria and verification commands.",
  "Use unique ids (letters, digits, underscores or hyphens). Depends on is required: none or comma-separated task ids; no cycles. Target is optional: frontend or backend only.",
  "Put metadata immediately after the task heading. The remaining Markdown is the task instructions; use level 4 or deeper headings for scope, acceptance criteria and tests. End tasks with the next task heading or a level 1 or 2 section.",
  "Metadata - Steps: implementation, testing selects execution stage IDs in task-specific order (no planning or duplicates). When omitted, tasks run all configured stages after planning. Outside orchestration, Steps must reference configured stages. Specify relevant unit, integration and/or E2E suites for Tests, and implementation scope and acceptance criteria for QA review.",
  "Tasks sharing files or resources must depend on one another; independent tasks may run concurrently.",
  "Optional - Parent: task-id groups a task under another task in the orchestrator tree. Parent is structural only; use Depends on for execution ordering. Parent links must reference existing tasks and have no cycles.",
  "Optional - Repairs: task-id marks a repair task. The referenced task waits for this repair to complete before it retries; do not make the repair depend on that task or its dependants. JSON uses repairFor.",
].join("\n");

export const ORCHESTRATOR_STEPS = [
  "Define a workflow for each task in the plan. Every task must declare a nonempty Steps list in its own execution order.",
  "Choose steps appropriate to the work; tasks may involve research, analysis, writing, design, operations or coding. Do not force Implementation and Tests onto every task.",
  "Select only steps that perform work or verification required by this task's scope. Backend-only work does not need a frontend test step; documentation-only work does not need backend or frontend test steps unless it changes their executable behavior. Include cross-domain checks only for an explicit integration or regression risk. Do not copy every specialist into every task or schedule a step merely to report Not applicable. Follow explicit project requirements when they mandate additional checks.",
  "Use built-in execution ids implementation, testing, qa, review when appropriate, or invent custom:Name ids such as custom:Research, custom:Write report, custom:Fact check. No planning, duplicate ids, commas or newlines in a step name.",
  "Custom steps do not need to be registered in config.json. Steps without a configured assignment inherit the Planning executor, model and effort; configured stage assignments take precedence unless overridden by an assigned agent file.",
  'Find and read the relevant agent definition files, including files referenced by the user or project instructions, in any directory (not only .claude/agents). When assigning an agent, add task metadata - Agents: {"custom:Research":"path/to/research.md","review":"other/folder/reviewer.md"}. Paths are relative to the project root or absolute. JSON tasks use the same mapping in agents. Each key must be in that task\'s Steps.',
  "An assigned agent file's model takes priority over configured stage, target and Planning models. Preserve these agent bindings when coordinating tasks; never replace an explicit agent model with the coordinator's model. Omitted model or model: inherit uses the workflow assignment. Do not invent models or agent paths. Read only relevant agent files, never credentials or secret files.",
  "Maestrun resolves model and effort from agent files and supplies each worker's execution request. Do not add requirements for workers to prove their own model identity by inspecting processes, session files or Planning-only config. Actual executor errors must still be reported.",
  "In each task's instructions, describe each step's scope, expected output and acceptance criteria under a level-4 heading. Run only the currently assigned step.",
  "The user reviews and may edit each task's Steps and instructions in plan.md before execution.",
].join("\n");
