import { generateInteractivePlan } from "./generate-interactive-plan.js";
import { join } from "node:path";
import { snapshotFile } from "../../shared/atomic.js";
import type { FileSnapshot } from "../../shared/atomic.js";
import { loadConfig } from "../../config/index.js";
import { executorLabel } from "../../contracts/workflow.js";
import type { Draft, ExecutorStatus } from "../../contracts/workflow.js";
import { CancelError, UserError } from "../../shared/errors.js";
import {
  generateClaude,
  generateCodex,
  generateCopilot,
  generateGrok,
  detectExecutor,
} from "../executors/index.js";
import { planningPrompt } from "./prompt.js";
import { runPlanWizard } from "./plan-wizard.js";
import type { CommandInput } from "../../shared/command.types.js";
import { lockRun } from "../execution/index.js";
import { previousPlan, saveGeneratedPlan } from "./replanning.js";

type PlanInput = CommandInput & { interactive?: boolean };
type Services = Readonly<{
  wizard: typeof runPlanWizard;
  detect: typeof detectExecutor;
  generate: (input: PlanInput & Readonly<{ draft: Draft }>) => Promise<string>;
}>;

function requireReady(status: ExecutorStatus): void {
  if (status.state !== "ready")
    throw new UserError(
      `${executorLabel(status.id)}: ${status.detail}.`,
      `${status.nextAction}, then run maestrun plan again.`,
    );
}

async function generatePlan(input: PlanInput & Readonly<{ draft: Draft }>): Promise<string> {
  if (input.interactive) return generateInteractivePlan(input);
  const stage = input.draft.config.stages[0];
  if (!stage || stage.id !== "planning") throw new Error("Missing planning stage");
  const generate = {
    codex: generateCodex,
    claude: generateClaude,
    copilot: generateCopilot,
    grok: generateGrok,
  }[stage.executor];
  return generate({
    cwd: input.cwd,
    model: stage.model,
    ...(stage.effort ? { effort: stage.effort } : {}),
    prompt: planningPrompt(input.draft),
    signal: input.signal,
    timeoutMs: input.draft.config.timeoutMs,
    onOutput: input.ui.write,
  });
}

const DEFAULT_SERVICES: Services = {
  wizard: runPlanWizard,
  detect: detectExecutor,
  generate: generatePlan,
};

export async function createPlan(
  input: PlanInput,
  services: Services = DEFAULT_SERVICES,
): Promise<void> {
  const saved = await loadConfig(input.cwd);
  if (!saved.config)
    throw new UserError(
      "No saved workflow was found.",
      "Run maestrun init before creating a plan.",
    );
  const path = join(input.cwd, "plan.md");
  const plan = await snapshotFile(path);
  const collectedAt = Date.now();
  const draft = await services.wizard({
    ...input,
    config: saved.config,
    planExists: plan.exists,
  });
  input.ui.log(
    `Requirements and planning options: ${((Date.now() - collectedAt) / 1000).toFixed(1)} s`,
  );
  if (input.signal.aborted) throw new CancelError();
  await generateLocked(input, services, { draft, path, plan });
}

async function generateLocked(
  input: PlanInput,
  services: Services,
  output: Readonly<{ draft: Draft; path: string; plan: FileSnapshot }>,
): Promise<void> {
  const { draft, path, plan } = output;
  const release = await lockRun(input.cwd);
  try {
    const progress = await previousPlan(input.cwd, plan);
    await generateAndSave(input, services, {
      draft: { ...draft, ...(progress ? { previousPlan: progress } : {}) },
      path,
      plan,
    });
  } finally {
    await release();
  }
}

async function generateAndSave(
  input: PlanInput,
  services: Services,
  output: Readonly<{ draft: Draft; path: string; plan: FileSnapshot }>,
): Promise<void> {
  const { draft } = output;
  const stage = draft.config.stages[0];
  if (!stage) throw new Error("Missing planning stage");
  requireReady(
    await services.detect({
      id: stage.executor,
      cwd: input.cwd,
      signal: input.signal,
    }),
  );
  input.ui.log(`Generating a plan with ${executorLabel(stage.executor)}…`);
  const content = await timedGeneration(input, services, draft);
  if (input.signal.aborted) throw new CancelError();
  if (!content.trim())
    throw new UserError(
      "The executor returned an empty plan.",
      "Adjust the planning model with maestrun init, then run maestrun plan again.",
    );
  await saveGeneratedPlan(input, output, content);
}

async function timedGeneration(
  input: PlanInput,
  services: Services,
  draft: Draft,
): Promise<string> {
  const generatedAt = Date.now();
  try {
    return await services.generate({ ...input, draft });
  } finally {
    input.ui.write("\n");
    input.ui.log(`Model wait: ${((Date.now() - generatedAt) / 1000).toFixed(1)} s`);
  }
}
