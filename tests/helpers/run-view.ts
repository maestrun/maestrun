import { PassThrough } from "node:stream";
import { vi } from "vitest";
import type { RunReport, TaskState } from "../../src/contracts/run.js";
import type { ViewState } from "../../src/modules/execution/index.js";

export function viewState(): ViewState {
  return { filter: 0, selected: "a", details: false, scroll: 0 };
}

export function viewReport(): RunReport {
  return {
    version: 1,
    startedAt: "2026-10-11T12:00:00Z",
    tasks: [
      { ...viewTask(), step: "implementation", executor: "codex", model: "code-test" },
      {
        ...viewTask(),
        id: "b",
        title: "Verify the application",
        status: "pending",
        completedSteps: 0,
      },
      { ...viewTask(), id: "c", title: "Prepare fixtures", status: "completed", completedSteps: 3 },
      {
        ...viewTask(),
        id: "d",
        title: "Deploy preview",
        status: "failed",
        completedSteps: 0,
        error: "Preview credentials are missing.",
      },
    ],
  };
}

export function viewTerminal(): {
  input: PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: ReturnType<typeof vi.fn<(raw: boolean) => void>>;
  };
  output: PassThrough & { isTTY: boolean; columns: number; rows: number };
  frames: string[];
} {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode: vi.fn(),
  });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 24 });
  const frames: string[] = [];
  output.on("data", (chunk: Buffer) => frames.push(chunk.toString()));
  return { input, output, frames };
}

export function viewTask(): TaskState {
  return {
    id: "a",
    title: "Build the application",
    status: "running",
    completedSteps: 1,
    totalSteps: 3,
  };
}
