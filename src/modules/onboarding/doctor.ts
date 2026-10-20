import os from "node:os";
import { loadConfig } from "../../config/index.js";
import { loadLayout } from "../../config/layout.js";
import type { Config } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { isCancellation, UserError } from "../../shared/errors.js";
import { cleanText } from "../../shared/terminal-text.js";
import { detectExecutors } from "../executors/index.js";
import { checkWorkspaceRepositories } from "../execution/index.js";
import { diagnoseFiles, diagnoseLocks } from "./diagnostic-files.js";
import type { Diagnostic } from "./diagnostic-files.js";

export function environmentChecks(
  version = process.versions.node,
  platform = process.platform,
  release = os.release(),
): Diagnostic[] {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  const supported = (major === 22 && minor >= 13) || major === 24 || major >= 26;
  return [
    {
      name: "Node.js",
      status: supported ? "ok" : "error",
      detail: version,
      ...(!supported ? { nextAction: "Install Node.js 24 LTS (or 22.13+, 26+)." } : {}),
    },
    {
      name: "Platform",
      status: platform === "win32" ? "error" : "ok",
      detail: /microsoft|wsl/iu.test(release) ? "WSL" : platform,
      ...(platform === "win32"
        ? {
            nextAction:
              "Run wsl --install, then install Node.js and Maestrun inside your Linux distribution.",
          }
        : {}),
    },
  ];
}

function failedCheck(name: string, error: unknown): Diagnostic {
  if (isCancellation(error)) throw error;
  return {
    name,
    status: "error",
    detail: error instanceof Error ? error.message : "Check failed",
    nextAction:
      error instanceof UserError
        ? error.nextAction
        : "Check project file permissions and run maestrun doctor again.",
  };
}

async function projectChecks(cwd: string, checks: Diagnostic[]): Promise<Config | undefined> {
  let config: Config | undefined;
  try {
    config = (await loadConfig(cwd)).config;
    checks.push({
      name: "Configuration",
      status: config ? "ok" : "warning",
      detail: config ? "Workflow is valid" : "No saved workflow",
      ...(!config ? { nextAction: "Run maestrun init or maestrun start." } : {}),
    });
    loadLayout(cwd);
    if (config?.execution?.mode === "parallel")
      await checkWorkspaceRepositories(cwd, config.execution?.repositories);
    if (config) checks.push(...(await diagnoseFiles(cwd, config)));
    checks.push(...(await diagnoseLocks(cwd)));
  } catch (error) {
    checks.push(failedCheck("Project", error));
  }
  return config;
}

export async function diagnose(
  input: Pick<CommandInput, "cwd" | "signal">,
  detect = detectExecutors,
): Promise<Diagnostic[]> {
  const checks = environmentChecks();
  const config = await projectChecks(input.cwd, checks);
  const required = new Set([
    ...(config?.stages.map((stage) => stage.executor) ?? []),
    ...Object.values(config?.targets ?? {}).map((target) => target.executor),
  ]);
  const statuses = await detect(input.cwd, input.signal);
  for (const item of statuses)
    checks.push({
      name: item.id,
      status: item.state === "ready" ? "ok" : required.has(item.id) ? "error" : "warning",
      detail: item.detail,
      ...(item.nextAction ? { nextAction: item.nextAction } : {}),
    });
  if (!statuses.some((item) => item.state === "ready"))
    checks.push({
      name: "Executors",
      status: "error",
      detail: "No authenticated, compatible executor is available",
      nextAction:
        "Install and authenticate an executor using the actions above, then run maestrun doctor.",
    });
  return checks;
}

export async function doctor(input: CommandInput, required = false): Promise<boolean> {
  const checks = await input.ui.progress("Checking environment (no model generation)…", () =>
    diagnose(input),
  );
  for (const check of checks) {
    input.ui.log(cleanText(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`));
    if (check.nextAction) input.ui.log(cleanText(`  Next: ${check.nextAction}`));
  }
  const ok = !checks.some((check) => check.status === "error");
  if (!ok && required)
    throw new UserError(
      "Environment checks failed.",
      "Apply the actions above, then retry. Run maestrun doctor to check again.",
    );
  return ok;
}
