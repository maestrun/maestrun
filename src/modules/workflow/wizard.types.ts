import type { ExecutorId, ExecutorStatus, Model, StepPreset } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";

export type WizardServices = Readonly<{
  detect: (cwd: string, signal: AbortSignal) => Promise<readonly ExecutorStatus[]>;
  models: (executor: ExecutorId, cwd: string, signal: AbortSignal) => Promise<readonly Model[]>;
}>;
export type WizardContext = CommandInput &
  Readonly<{
    services: WizardServices;
    catalog: (executor: ExecutorId) => Promise<readonly Model[]>;
    stepPresets?: readonly StepPreset[];
  }>;
