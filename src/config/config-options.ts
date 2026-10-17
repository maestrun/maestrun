import { isRecord } from "../contracts/workflow.js";
import type { Config, Execution } from "../contracts/workflow.js";
import { UserError } from "../shared/errors.js";

function invalid(field: string): never {
  throw new UserError(
    `Invalid configuration field: ${field}.`,
    "Check execution, timeoutMs and plugins in .maestrun/config.json against the README.",
  );
}

function execution(value: unknown): Execution {
  if (!isRecord(value)) return invalid("execution");
  const mode = value.mode === undefined ? "sequential" : value.mode;
  if (mode !== "sequential" && mode !== "parallel") return invalid("execution.mode");
  const concurrency = value.concurrency ?? 2;
  if (
    !Number.isInteger(concurrency) ||
    typeof concurrency !== "number" ||
    concurrency < 1 ||
    concurrency > 16
  )
    return invalid("execution.concurrency (integer 1–16)");
  validateExecutionOptions(value);
  return {
    mode,
    concurrency,
    ...(typeof value.maxRepairs === "number" ? { maxRepairs: value.maxRepairs } : {}),
    ...(typeof value.background === "boolean" ? { background: value.background } : {}),
    ...(value.orchestrator === "plan" || value.orchestrator === "agent"
      ? { orchestrator: value.orchestrator }
      : {}),
  };
}

function plugins(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (path): path is string =>
        typeof path === "string" && /^\.\/.+\.(?:mjs|js)$/u.test(path) && !/[\p{Cc}]/u.test(path),
    )
  )
    return invalid("plugins (relative .js or .mjs paths)");
  if (new Set(value).size !== value.length) return invalid("plugins (duplicate paths)");
  return value;
}

export function configOptions(value: Record<string, unknown>): Partial<Config> {
  if (
    value.timeoutMs !== undefined &&
    (typeof value.timeoutMs !== "number" ||
      !Number.isInteger(value.timeoutMs) ||
      value.timeoutMs < 1000 ||
      value.timeoutMs > 86400000)
  )
    return invalid("timeoutMs (integer 1000–86400000)");
  return {
    ...(value.execution === undefined ? {} : { execution: execution(value.execution) }),
    ...(typeof value.timeoutMs === "number" ? { timeoutMs: value.timeoutMs } : {}),
    ...(value.plugins === undefined ? {} : { plugins: plugins(value.plugins) }),
  };
}

function validateExecutionOptions(value: Record<string, unknown>): void {
  if (value.background !== undefined && typeof value.background !== "boolean")
    return invalid("execution.background (boolean)");
  if (
    value.orchestrator !== undefined &&
    value.orchestrator !== "plan" &&
    value.orchestrator !== "agent"
  )
    return invalid("execution.orchestrator (plan or agent)");
  if (
    value.maxRepairs !== undefined &&
    (!Number.isInteger(value.maxRepairs) ||
      typeof value.maxRepairs !== "number" ||
      value.maxRepairs < 0 ||
      value.maxRepairs > 100)
  )
    return invalid("execution.maxRepairs (integer 0–100)");
}
