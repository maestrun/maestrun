import { argumentsFor, stepPrompt, stepResult } from "./step-protocol.js";
import { interactiveStep } from "./interactive-step.js";
import {
  parseCodexOutput,
  claudeEnvironment,
  parseClaudeOutput,
  generateCopilot,
  generateGrok,
} from "../executors/index.js";
import { runCommand } from "../../shared/process.js";
import type { StepInput } from "../../contracts/run.js";
import { tokenUsageCollector } from "../../shared/token-usage.js";

export async function executeStep(input: StepInput): Promise<string> {
  if (input.conversationId)
    return stepResult(await interactiveStep(input, await stepPrompt(input)));
  if (input.stage.executor === "copilot" || input.stage.executor === "grok")
    return stepResult(
      await (input.stage.executor === "grok" ? generateGrok : generateCopilot)({
        ...input,
        ...input.stage,
        prompt: await stepPrompt(input),
        execution: true,
      }),
    );
  const result = await runCommand({
    executable: input.stage.executor,
    args: argumentsFor(input),
    cwd: input.cwd,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    env: input.stage.executor === "claude" ? claudeEnvironment(input.stage.effort) : process.env,
    input: await stepPrompt(input),
    onStdoutLine: tokenUsageCollector(input.stage.executor, input.onUsage).line,
  });
  return stepResult(
    input.stage.executor === "codex"
      ? parseCodexOutput(result, true)
      : parseClaudeOutput(result, input.stage.model),
  );
}
