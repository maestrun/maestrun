import type { TokenUsage } from "../contracts/run.js";
import type { ExecutorId } from "../contracts/workflow.js";
import { isRecord } from "../contracts/workflow.js";

export function validTokenUsage(value: unknown): value is TokenUsage {
  return isRecord(value) && validCount(value.inputTokens) && validCount(value.outputTokens);
}

export function validUsageRecord(value: Record<string, unknown>): boolean {
  return (
    (value.tokenUsage === undefined || validTokenUsage(value.tokenUsage)) &&
    (value.tokenUsageIncomplete === undefined || typeof value.tokenUsageIncomplete === "boolean")
  );
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function claudeUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value) || !Object.keys(value).length) return;
  const total = { inputTokens: 0, outputTokens: 0 };
  for (const usage of Object.values(value)) {
    if (!isRecord(usage)) return;
    const read = usage.cacheReadInputTokens ?? 0;
    const write = usage.cacheCreationInputTokens ?? 0;
    if (!validTokenUsage(usage) || !validCount(read) || !validCount(write)) return;
    total.inputTokens += usage.inputTokens + read + write;
    total.outputTokens += usage.outputTokens;
  }
  return total;
}

// One collector per process: callbacks receive increments, never cumulative snapshots.
export function tokenUsageCollector(
  executor: ExecutorId,
  report?: (usage: TokenUsage) => void,
): { event: (value: Record<string, unknown>) => void; line: (line: string) => void } {
  let previous = { inputTokens: 0, outputTokens: 0 };
  const event = (value: Record<string, unknown>): void => {
    const usage = eventUsage(executor, value);
    if (!report || !validTokenUsage(usage)) return;
    if (executor === "copilot" || value.type === "turn.completed") report(usage);
    else {
      if (usage.inputTokens < previous.inputTokens || usage.outputTokens < previous.outputTokens)
        return;
      report({
        inputTokens: usage.inputTokens - previous.inputTokens,
        outputTokens: usage.outputTokens - previous.outputTokens,
      });
      previous = usage;
    }
  };
  return { event, line: (line) => readLine(line, event) };
}

function eventUsage(executor: ExecutorId, value: Record<string, unknown>): unknown {
  if ((executor === "claude" || executor === "grok") && value.type === "result")
    return claudeUsage(value.modelUsage);
  if (executor === "copilot" && value.type === "assistant.usage") return value.data;
  if (executor !== "codex") return;
  if (value.method === "thread/tokenUsage/updated" && isRecord(value.params)) {
    const usage = value.params.tokenUsage;
    if (isRecord(usage)) return usage.total;
  }
  if (value.type === "turn.completed" && isRecord(value.usage))
    return { inputTokens: value.usage.input_tokens, outputTokens: value.usage.output_tokens };
}

function readLine(line: string, event: (value: Record<string, unknown>) => void): void {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return;
  }
  if (isRecord(value)) event(value);
}

export function tokenUsageLabel(task: {
  tokenUsage?: TokenUsage;
  tokenUsageIncomplete?: boolean;
}): string {
  const usage = task.tokenUsage;
  if (!usage) return "in: n/a · out: n/a";
  return `in: ${usage.inputTokens} · out: ${usage.outputTokens}${task.tokenUsageIncomplete ? " (partial)" : ""}`;
}

const COMPACT_TOKENS = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumSignificantDigits: 3,
});

export function tokenUsageColumn(task: {
  tokenUsage?: TokenUsage;
  tokenUsageIncomplete?: boolean;
}): string {
  if (!task.tokenUsage) return "n/a";
  const counts = [task.tokenUsage.inputTokens, task.tokenUsage.outputTokens].map((count) =>
    count < 100000 ? String(count) : COMPACT_TOKENS.format(count),
  );
  return `${counts.join("/")}${task.tokenUsageIncomplete ? "*" : ""}`;
}
