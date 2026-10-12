import type { Config, Draft, ExecutorStatus } from "../../src/contracts/workflow.js";
import type { Ui } from "../../src/shared/ui.types.js";
import type { WizardContext } from "../../src/modules/workflow/index.js";

export const CONFIG: Config = {
  version: 1,
  stages: [{ id: "planning", executor: "codex", model: "codex-test" }],
};
export const DRAFT: Draft = {
  config: CONFIG,
  requirements: { text: "Add the requested command.", source: "Pasted text" },
};
export const READY: readonly ExecutorStatus[] = [
  { id: "codex", state: "ready", detail: "Ready", nextAction: "" },
  { id: "claude", state: "ready", detail: "Ready", nextAction: "" },
];

export function wizardContext(cwd: string, ui: Ui): WizardContext {
  return {
    cwd,
    ui,
    signal: new AbortController().signal,
    services: { detect: async () => READY, models: async () => [] },
    catalog: async (executor) =>
      executor === "codex"
        ? [
            {
              id: "codex-test",
              name: "Test model",
              isDefault: true,
              efforts: ["low", "medium", "high"],
              defaultEffort: "medium",
            },
          ]
        : [],
  };
}
