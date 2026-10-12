import { readFileSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { saveConfig } from "../../src/config/index.js";
import { createPlan, generateInteractivePlan } from "../../src/modules/planning/index.js";
import type { ExecutorId } from "../../src/contracts/workflow.js";
import { CONFIG, DRAFT } from "../helpers/context.js";
import { executionProcesses } from "../helpers/execution-processes.js";
import { installExecutors } from "../helpers/fake-executors.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

async function setup(cwd: string, executor: ExecutorId): Promise<void> {
  await saveConfig(
    cwd,
    {
      ...CONFIG,
      timeoutMs: 2000,
      stages: [{ id: "planning", executor, model: `${executor}-test` }],
    },
    { exists: false, content: "" },
  );
  await writeFile(join(cwd, "plan.md"), "previous plan");
}

test.for(["codex", "claude"] as const)(
  "%s displays output before saving the completed plan",
  async (executor, { project }) => {
    await installExecutors(project, "streaming");
    await setup(project.cwd, executor);
    const script = scriptedUi(["path", "requirements.md", true, true]);
    const ui = {
      ...script.ui,
      write: (text: string) => {
        script.ui.write(text);
        if (!text.includes("Creating the plan")) return;
        expect(readFileSync(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
        writeFileSync(join(project.cwd, ".stream-continue"), "");
      },
    };
    await createPlan({ cwd: project.cwd, ui, signal: new AbortController().signal });
    const output = script.messages.join("");
    expect(output).toContain("Creating the plan…");
    expect(output.match(/## Objective and scope/gu)).toHaveLength(1);
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toContain("## Tasks");
  },
);

test.for(["codex", "claude"] as const)(
  "cancelling streamed %s output preserves the previous plan",
  async (executor, { project }) => {
    await installExecutors(project, "streaming");
    await setup(project.cwd, executor);
    const script = scriptedUi(["path", "requirements.md", true, true]);
    const controller = new AbortController();
    const ui = {
      ...script.ui,
      write: (text: string) => {
        if (text.includes("Creating the plan")) controller.abort();
      },
    };
    await expect(createPlan({ cwd: project.cwd, ui, signal: controller.signal })).rejects.toThrow(
      "Cancelled",
    );
    expect(await readFile(join(project.cwd, "plan.md"), "utf8")).toBe("previous plan");
  },
);

test("interactive Codex displays deltas around questions without duplicating completed items", async ({
  project,
}) => {
  await executionProcesses(project, "streaming");
  const script = scriptedUi(["0"]);
  const ui = {
    ...script.ui,
    select: async (...args: Parameters<typeof script.ui.select>) => {
      expect(script.messages.join("")).toContain("Choosing scope.\n\n");
      return script.ui.select(...args);
    },
    write: (text: string) => {
      script.ui.write(text);
      if (text === "# Plan") writeFileSync(join(project.cwd, ".stream-continue"), "");
    },
  };
  const content = await generateInteractivePlan({
    cwd: project.cwd,
    ui,
    signal: new AbortController().signal,
    draft: { ...DRAFT, config: { ...DRAFT.config, timeoutMs: 2000 } },
  });
  expect(content).toBe("# Plan\nAcceptance criteria and verification.");
  const output = script.messages.join("");
  expect(output.match(/Choosing scope\./gu)).toHaveLength(1);
  expect(output.match(/# Plan/gu)).toHaveLength(1);
  expect(output).toContain(content);
});
