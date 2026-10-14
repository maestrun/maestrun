import type { Stage, Effort } from "./workflow.js";
import type { Task } from "./tasks.js";

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type TaskMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  status?: "queued" | "sent" | "rejected";
  error?: string;
};
export type TaskConversation = { active: boolean; messages: TaskMessage[] };
export type TaskRerun = {
  startedAt: string;
  fromStep: string;
  toStep: "implementation";
  justification: string;
};
export type TaskStep = {
  summary?: string;
  conversationId?: string;
  conversation?: TaskConversation;
  id: string;
  title: string;
  model?: string;
  effort?: Effort;
  tokenUsage?: TokenUsage;
  tokenUsageIncomplete?: boolean;
  status: "pending" | "running" | "completed" | "failed" | "refactor" | "cancelled";
};

export type StepInput = Readonly<{
  cwd: string;
  projectCwd?: string;
  maxRepairs?: number;
  task: Task;
  stage: Stage;
  signal: AbortSignal;
  timeoutMs: number;
  conversationId?: string;
  feedback?: string;
  previousResults?: readonly Readonly<{ stage: string; summary: string }>[];
  /** Token increments reported by the executor, including failed attempts. */
  onUsage?: (usage: TokenUsage) => void;
}>;
export type TaskWorktree = {
  id: string;
  base: string;
  result?: string;
  integrated?: boolean;
  resolving?: boolean;
  retained?: { id: string; base: string }[];
};
export type TaskState = {
  integration?: "pending" | "running";
  worktree?: TaskWorktree;
  id: string;
  definition?: string;
  plannedStages?: string[];
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled" | "refactor";
  steps?: TaskStep[];
  reruns?: TaskRerun[];
  step?: string;
  executor?: string;
  model?: string;
  effort?: Effort;
  completedSteps: number;
  totalSteps: number;
  error?: string;
  summary?: string;
  tokenUsage?: TokenUsage;
  tokenUsageIncomplete?: boolean;
  conversationId?: string;
  conversation?: TaskConversation;
};
export type RunReport = {
  version: 1;
  startedAt: string;
  finishedAt?: string;
  tasks: TaskState[];
  archivedTasks?: TaskState[];
};
