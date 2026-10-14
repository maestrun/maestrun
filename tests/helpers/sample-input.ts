import { expect, vi } from "vitest";
import { answerTaskInput, readCheckpoint } from "../../src/modules/execution/index.js";
import type { sessionCli } from "./session-cli.js";

export async function sampleDirectory(cli: ReturnType<typeof sessionCli>): Promise<string> {
  await cli.wait("Sample project:");
  const directory = /Sample project: ([^\r\n]+)/u.exec(cli.output())?.[1];
  if (!directory) throw new Error("Missing sample directory");
  return directory;
}

export async function answerSampleApproval(cwd: string): Promise<void> {
  await vi.waitFor(
    async () => {
      expect(
        (await readCheckpoint(cwd)).find((task) => task.id === "sample-confirmation")?.status,
      ).toBe("on_hold");
    },
    { timeout: 8000 },
  );
  const task = (await readCheckpoint(cwd)).find((entry) => entry.id === "sample-confirmation");
  if (!task) throw new Error("Missing confirmation task");
  await answerTaskInput(cwd, task, "continue");
}
