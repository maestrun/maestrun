import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { test } from "../helpers/project.js";
import { setupRun } from "../helpers/run.js";
import { scriptedUi } from "../helpers/ui.js";

for (const outcome of ["success", "failure", "cancel", "save-error"]) {
  test(`closes the run view on ${outcome}`, async ({ project }) => {
    await setupRun(project.cwd);
    const controller = new AbortController();
    const view = { update: vi.fn(), close: vi.fn() };
    const plain = scriptedUi([]);
    const ui = {
      ...plain.ui,
      runView: vi.fn(() => {
        if (outcome === "save-error") mkdirSync(join(project.cwd, ".maestrun/run.json"));
        return view;
      }),
    };
    const run = runWorkflow(
      { cwd: project.cwd, ui, signal: controller.signal, tasksPath: "tasks.json" },
      async () => {
        if (outcome === "failure") throw new Error("Stage failed");
        if (outcome === "cancel") controller.abort();
        return "Verified";
      },
    );
    if (outcome === "success") await run;
    else await expect(run).rejects.toThrow();
    expect(ui.runView).toHaveBeenCalledOnce();
    expect(view.close).toHaveBeenCalledOnce();
    if (outcome !== "save-error") expect(view.update).toHaveBeenCalled();
    expect(plain.messages.join("\n")).not.toContain("Progress:");
  });
}
