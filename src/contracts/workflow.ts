export const STAGES = ["planning", "implementation", "testing", "qa", "review"] as const;
export const DEFAULT_MAX_REPAIRS = 5;
export const DEFAULT_STAGES = ["planning", "implementation", "testing"] as const;
export const EXECUTORS = ["codex", "claude", "copilot", "grok"] as const;
export const EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;
export const MAX_STEP_NAME_LENGTH = 80;
const CUSTOM_STAGE_PREFIX = "custom:";
export type BuiltinStageId = (typeof STAGES)[number];
export type StageId = BuiltinStageId | `custom:${string}`;
export type ExecutorId = (typeof EXECUTORS)[number];
export type Effort = (typeof EFFORTS)[number];
export type Assignment = Readonly<{ executor: ExecutorId; model: string; effort?: Effort }>;
export type StepPreset = Readonly<{ name: string }> & Partial<Assignment>;
export type Stage = Assignment & Readonly<{ id: StageId; file?: string; agent?: string }>;
export type Targets = Readonly<{ frontend: Assignment; backend: Assignment }>;
export type Execution = Readonly<{
  mode: "sequential" | "parallel";
  concurrency: number;
  maxRepairs?: number;
  background?: boolean;
  orchestrator?: "plan" | "agent";
}>;
export type Config = Readonly<{
  version: 1;
  stages: readonly Stage[];
  targets?: Targets;
  execution?: Execution;
  timeoutMs?: number;
  plugins?: readonly string[];
}>;
export type Requirements = Readonly<{ text: string; source: string }>;
export type StepFile = Readonly<{ id: StageId; path: string; content?: string }>;
export type Setup = Readonly<{
  config: Config;
  files?: readonly StepFile[];
  prepareOrchestratorPlan?: boolean;
}>;
export type GuidanceFile = Readonly<{ path: string; content: string }>;
export type Guidance = Readonly<{
  skills: readonly GuidanceFile[];
  rules: readonly GuidanceFile[];
}>;
export type Draft = Readonly<{
  config: Config;
  requirements: Requirements;
  guidance?: Guidance;
  planMode?: "simple" | "advanced" | "existing";
  planFolder?: string;
  previousPlan?: string;
}>;
export type Model = Readonly<{
  id: string;
  name: string;
  isDefault: boolean;
  efforts?: readonly Effort[];
  defaultEffort?: Effort;
}>;
export type ExecutorStatus = Readonly<{
  id: ExecutorId;
  state: "ready" | "missing" | "unauthenticated" | "incompatible" | "unknown";
  detail: string;
  nextAction: string;
}>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExecutor(value: unknown): value is ExecutorId {
  return EXECUTORS.some((id) => id === value);
}

export function isBuiltinStage(value: unknown): value is BuiltinStageId {
  return STAGES.some((id) => id === value);
}

export function validStepName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_STEP_NAME_LENGTH &&
    value === value.trim() &&
    !/[\p{Cc}\p{Cf}]/u.test(value) &&
    !isBuiltinStage(value.toLowerCase())
  );
}

export function isStage(value: unknown): value is StageId {
  return (
    isBuiltinStage(value) ||
    (typeof value === "string" &&
      value.startsWith(CUSTOM_STAGE_PREFIX) &&
      validStepName(value.slice(CUSTOM_STAGE_PREFIX.length)))
  );
}

export function validModel(value: unknown): value is string {
  return typeof value === "string" && /^[\w][\w.:/[\]-]*$/u.test(value);
}

export function validStepFile(value: unknown): value is string {
  return (
    typeof value === "string" && /^\.maestrun\/steps\/[\p{L}\p{N}][\p{L}\p{N}-]*\.md$/u.test(value)
  );
}

export function validEffort(value: unknown, executor: ExecutorId): value is Effort {
  if (executor === "copilot" || executor === "grok")
    return EFFORTS.some((effort) => effort === value && effort !== "ultra");
  return (
    EFFORTS.some((effort) => effort === value) &&
    (executor === "codex" || (value !== "none" && value !== "minimal" && value !== "ultra"))
  );
}

export function stageLabel(id: StageId): string {
  if (id === "testing") return "Tests";
  if (id === "qa") return "QA";
  return isBuiltinStage(id)
    ? id.charAt(0).toUpperCase() + id.slice(1)
    : id.slice(CUSTOM_STAGE_PREFIX.length);
}

export function workflowOrder(selected: readonly StageId[]): readonly StageId[] {
  const ids: StageId[] = STAGES.filter(
    (id) => DEFAULT_STAGES.some((stage) => stage === id) || selected.includes(id),
  );
  let previous: StageId = "planning";
  for (const id of selected) {
    if (!ids.includes(id)) ids.splice(ids.indexOf(previous) + 1, 0, id);
    previous = id;
  }
  return ids;
}

export function executorLabel(id: ExecutorId): string {
  return { codex: "Codex", claude: "Claude Code", copilot: "GitHub Copilot", grok: "Grok Build" }[
    id
  ];
}
