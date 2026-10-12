import { executorLabel, isRecord } from "../../contracts/workflow.js";
import { VERSION } from "../../shared/version.js";
import type { Draft } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import {
  CODEX_RESTRICTIONS,
  generateClaude,
  generateCopilot,
  generateGrok,
} from "../executors/index.js";
import { connectPlan } from "./plan-rpc.client.js";
import type { PlanRpc } from "./plan-rpc.client.js";
import { answerQuestions } from "./plan-questions.js";
import { killProcess, monitorProcess, startProcess } from "../../shared/process.js";
import { planningPrompt } from "./prompt.js";
import type { CommandInput } from "../../shared/command.types.js";

type Input = CommandInput & { draft: Draft };

function interactivePrompt(draft: Draft): string {
  return planningPrompt(draft).replace(
    "If clarification is necessary, record it as an unresolved question instead of asking interactively.",
    "Ask the user questions when clarification is needed. Plan only; do not implement the plan.",
  );
}

async function startTurn(rpc: PlanRpc, input: Input): Promise<void> {
  const stage = input.draft.config.stages[0];
  if (!stage) throw new Error("Missing planning stage");
  const result = await rpc.request("thread/start", {
    model: stage.model,
    cwd: input.cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    allowProviderModelFallback: false,
  });
  if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.id !== "string")
    throw new UserError("Codex did not start a planning thread.", "Update Codex and retry.");
  await rpc.request("turn/start", {
    threadId: result.thread.id,
    input: [{ type: "text", text: interactivePrompt(input.draft), text_elements: [] }],
    collaborationMode: {
      mode: "plan",
      settings: {
        model: stage.model,
        reasoning_effort: stage.effort ?? null,
        developer_instructions: null,
      },
    },
  });
}

async function codexPlan(input: Input): Promise<string> {
  const command = {
    executable: "codex",
    args: [...CODEX_RESTRICTIONS, "app-server"],
    cwd: input.cwd,
    signal: input.signal,
    timeoutMs: input.draft.config.timeoutMs ?? 600000,
  };
  const child = startProcess(command);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const rpc = connectPlan(child, input.ui);
  const cleanup = monitorProcess(child, command, rpc.fail);
  const start = async (): Promise<void> => {
    await rpc.request("initialize", {
      clientInfo: { name: "maestrun", version: VERSION },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
    await startTurn(rpc, input);
  };
  try {
    const [, content] = await Promise.all([start(), rpc.done]);
    return content.replace(/^<proposed_plan>\s*|\s*<\/proposed_plan>$/gu, "");
  } finally {
    rpc.close();
    cleanup();
    killProcess(child, "SIGKILL");
    await closed;
  }
}

function parsePlanningResponse(response: string, label: string): unknown {
  try {
    return JSON.parse(response.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/u, "$1"));
  } catch {
    throw new UserError(
      `${label} returned invalid interactive planning output.`,
      "Retry maestrun plan --interactive with a supported model.",
    );
  }
}

async function promptPlan(input: Input): Promise<string> {
  const stage = input.draft.config.stages[0];
  if (!stage) throw new Error("Missing planning stage");
  const generate =
    stage.executor === "grok"
      ? generateGrok
      : stage.executor === "copilot"
        ? generateCopilot
        : generateClaude;
  let prompt = `${interactivePrompt(input.draft)}\nFor this interactive exchange return ONLY JSON: {"questions":[{"id":"scope","question":"...","options":[{"label":"..."}]}]} or {"plan":"complete Markdown plan"}.`;
  while (true) {
    const response = await generate({
      ...stage,
      cwd: input.cwd,
      signal: input.signal,
      prompt,
      timeoutMs: input.draft.config.timeoutMs,
      onOutput: input.ui.write,
    });
    input.ui.write("\n");
    const value = parsePlanningResponse(response, executorLabel(stage.executor));
    if (isRecord(value) && typeof value.plan === "string" && value.plan.trim()) return value.plan;
    const answers = await answerQuestions(input.ui, isRecord(value) ? value.questions : undefined);
    prompt += `\nQuestions: ${JSON.stringify(value)}\nUser answers: ${JSON.stringify(answers)}\nContinue planning. Return questions or the complete plan using the same JSON format.`;
  }
}

export async function generateInteractivePlan(input: Input): Promise<string> {
  input.ui.log(
    "Planning with questions enabled. Esc or Ctrl+C cancels and preserves the previous plan.",
  );
  try {
    return await (input.draft.config.stages[0]?.executor === "codex"
      ? codexPlan(input)
      : promptPlan(input));
  } finally {
    input.ui.cancelPending?.();
  }
}
