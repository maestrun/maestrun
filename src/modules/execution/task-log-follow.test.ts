import { expect, test } from "vitest";
import { viewReport, viewState, viewTask } from "../../../tests/helpers/run-view.js";
import { taskBody } from "./run-task-view.js";
import { navigateView } from "./run-view-state.js";
import type { TaskStep } from "../../contracts/run.js";

function activeStep(): TaskStep {
  return {
    id: "implementation",
    title: "Implementation",
    status: "running",
    conversation: {
      active: true,
      messages: [
        {
          id: "1",
          role: "model",
          text: "Earlier output\n".repeat(30) + "Applying your instructions.",
        },
      ],
    },
  };
}

test("following instructions keeps the active log visible before later pending steps", () => {
  const task = {
    ...viewTask(),
    step: "implementation",
    steps: [
      activeStep(),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `later-${i}`,
        title: `Later ${i}`,
        status: "pending" as const,
      })),
    ],
  };
  const report = { ...viewReport(), tasks: [task] };
  const state = { ...viewState(), details: true, logs: true, follow: true };
  const body = (): string => taskBody(report, state, { width: 100, height: 14 }).join("\n");
  expect(body()).toContain("Applying your instructions.");
  navigateView(state, report, { name: "down" });
  expect(state.follow).toBe(false);
  expect(body()).toContain("Later 0");
});
