import { DEFAULT_MAX_REPAIRS, isRecord, stageLabel } from "../../contracts/workflow.js";
import { UserError, RefactorError, StepFailedError } from "../../shared/errors.js";
import { codexArguments, copilotArguments, grokArguments } from "../executors/index.js";
import { readRequirements } from "../../shared/requirements.js";
import { inputPrompt, requireTaskInput } from "./task-input.js";
import { evidencePrompt } from "./step-evidence.js";
import type { StepInput } from "../../contracts/run.js";

export const CODEX_NETWORK_ARGUMENTS = [
  "--config",
  "sandbox_workspace_write.network_access=true",
] as const;

function codexStepArguments(input: StepInput): readonly string[] {
  return [
    ...CODEX_NETWORK_ARGUMENTS,
    ...codexArguments(input.stage.model, input.stage.effort).map((arg) =>
      arg === "read-only" ? "workspace-write" : arg,
    ),
  ];
}

function claudeStepSettings(model: string): string {
  return JSON.stringify({
    disableAllHooks: true,
    availableModels: [model],
    fallbackModel: [],
    sandbox: { network: { allowLocalBinding: true } },
  });
}

export function argumentsFor(input: StepInput): readonly string[] {
  const { stage } = input;
  if (stage.executor === "grok") return grokArguments({ ...stage, execution: true });
  if (stage.executor === "copilot") return copilotArguments(stage.model, stage.effort, true);
  if (stage.executor === "codex") return codexStepArguments(input);
  return [
    "--print",
    "--model",
    stage.model,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--permission-prompts",
    "none",
    "--allowedTools",
    "Read,Glob,Grep,Edit,Write,Bash",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--settings",
    claudeStepSettings(stage.model),
    ...(stage.effort ? ["--effort", stage.effort] : []),
  ];
}

function verificationPrompt(stage: StepInput["stage"]): string {
  if (stage.id === "testing")
    return "For Tests: run the relevant unit, integration and/or E2E test suites for this task, adding or updating coverage when needed. Report commands, actual results and any unrun suites. Return refactor if application code needs changes; leave those changes to Implementation.";
  if (stage.id === "qa")
    return "For QA: review the implementation scope against the task requirements, plan and acceptance criteria. Inspect the code and delivered artifacts for missing requirements, incomplete behavior and out-of-scope changes. Use test evidence from Tests; this stage is a scope review, not another test execution stage. Report concrete gaps with file references and return refactor when changes are required; leave those changes to Implementation.";
  return "";
}

export async function stepPrompt(input: StepInput): Promise<string> {
  const instructions = input.stage.file
    ? (await readRequirements(input.cwd, input.stage.file)).text
    : "";
  return [
    `Run only the ${stageLabel(input.stage.id)} stage for task ${input.task.id}: ${input.task.title}.`,
    "Read plan.md, if present, for the full plan and project skills/rules. Follow repository instructions. Do not commit, push, deploy, or start other tasks.",
    "Other independent tasks may be running. Limit edits and commands to this task's scope.",
    verificationPrompt(input.stage),
    "For local HTTP or browser checks, start the test server and run its clients in the same shell command so they share the sandbox network namespace. Wait for readiness and stop the server on exit, including failures. Do not assume localhost servers from separate shell commands are reachable.",
    'Return ONLY JSON: {"status":"completed"|"failed"|"refactor","summary":"result and verification evidence"}. Use refactor when the step needs changes before it can pass.',
    ...inputPrompt(input),
    "Use failed for execution blockers, failed checks, or incomplete work unrelated to a user decision. Never claim unrun checks passed.",
    `The orchestrator allows up to ${input.maxRepairs ?? DEFAULT_MAX_REPAIRS} automatic repair cycles per task in this run after a failed or refactor result, returning to Implementation when configured and rerunning subsequent stages. Report concrete findings; do not run other stages yourself.`,
    ...(input.projectCwd
      ? [
          "This task runs in an isolated Git worktree. Keep all edits and dependency installation here; do not modify the main project or sibling worktrees. Do not change Git branches or commits. Use task-specific ports and database names for checks.",
        ]
      : []),
    input.task.instructions,
    instructions,
    ...evidencePrompt(input),
    ...(input.feedback
      ? [
          "Retry of existing work: address the previous failure within this stage's scope. Preserve earlier evidence and verify repairs; do not repeat deliberate fault injection already demonstrated. Later stages will be run by the orchestrator.",
          `Previous failure: ${input.feedback}`,
        ]
      : []),
  ].join("\n");
}

export function stepResult(text: string): string {
  const value = parseResult(text);
  requireTaskInput(value);
  if (isRecord(value) && value.status === "failed" && typeof value.summary === "string")
    throw new StepFailedError(
      `Step failed: ${value.summary.replace(/[\p{Cc}]/gu, " ").slice(0, 2000)}`,
      "Fix the reported failure before rerunning.",
    );
  if (isRecord(value) && value.status === "refactor" && typeof value.summary === "string")
    throw new RefactorError(
      `Changes needed: ${value.summary.replace(/[\p{Cc}]/gu, " ").slice(0, 2000)}`,
      "Review the requested changes before rerunning this task.",
    );
  if (
    !isRecord(value) ||
    value.status !== "completed" ||
    typeof value.summary !== "string" ||
    !value.summary.trim()
  )
    throw new UserError(
      "The executor reported an incomplete or failed step.",
      "Inspect the task's code and checks before rerunning.",
    );
  return value.summary;
}

function parseResult(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/u, "$1"));
  } catch {
    throw new UserError(
      "Executor returned an invalid step result.",
      "Inspect the task and retry; the final response must be status/summary JSON.",
    );
  }
  return value;
}
