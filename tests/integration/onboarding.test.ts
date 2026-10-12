import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { loadConfig, saveConfig } from "../../src/config/index.js";
import { runQuickWizard } from "../../src/modules/workflow/index.js";
import { diagnose, environmentChecks, start } from "../../src/modules/onboarding/index.js";
import { runWorkflow } from "../../src/modules/execution/index.js";
import { BackError, UserError } from "../../src/shared/errors.js";
import { test } from "../helpers/project.js";
import { READY, wizardContext } from "../helpers/context.js";
import { scriptedUi } from "../helpers/ui.js";
import { RUN_CONFIG, setupRun } from "../helpers/run.js";

function input(cwd: string, responses: Parameters<typeof scriptedUi>[0] = []) {
  const script = scriptedUi(responses);
  return { cwd, signal: new AbortController().signal, ui: script.ui, script };
}

test("quick setup asks executor, model, workflow and confirmation only", async ({ project }) => {
  const context = input(project.cwd, ["codex", "codex-test", "standard", true]);
  const services = wizardContext(project.cwd, context.ui).services;
  const result = await runQuickWizard({ ...context, saved: undefined }, services);
  expect(result.config.stages.map((stage) => stage.id)).toEqual([
    "planning",
    "implementation",
    "testing",
  ]);
  expect(result.config.stages.every((stage) => stage.model === "codex-test" && !stage.effort)).toBe(
    true,
  );
  expect(result.config.execution).toEqual({
    mode: "sequential",
    concurrency: 1,
    background: false,
  });
  expect(context.script.calls).toHaveLength(4);
  expect(context.script.messages.join("\n")).toContain("| Stage / target");
  expect((await loadConfig(project.cwd)).config).toBeUndefined();
});

test("quick setup supports back and cancellation without writing", async ({ project }) => {
  const context = input(project.cwd, ["codex", new BackError(), new BackError()]);
  await expect(
    runQuickWizard(
      { ...context, saved: undefined },
      wizardContext(project.cwd, context.ui).services,
    ),
  ).rejects.toThrow("Cancelled");
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
});

test("doctor is read-only and reports missing instruction and extension files", async ({
  project,
}) => {
  const context = input(project.cwd);
  expect(
    (await diagnose(context, async () => READY)).some((check) => check.status === "error"),
  ).toBe(false);
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
  await saveConfig(
    project.cwd,
    {
      ...RUN_CONFIG,
      plugins: ["./plugin.mjs"],
      stages: [
        ...RUN_CONFIG.stages,
        { id: "custom:Audit", executor: "codex", model: "test", file: ".maestrun/steps/audit.md" },
      ],
    },
    { exists: false, content: "" },
  );
  const checks = await diagnose(context, async () => READY);
  expect(checks.filter((check) => check.status === "error").map((check) => check.name)).toEqual([
    ".maestrun/steps/audit.md",
    "./plugin.mjs",
  ]);
  expect(checks.find((check) => check.name === "./plugin.mjs")?.nextAction).toContain("remove");
});

test("doctor reports unsupported Node, Windows and WSL", () => {
  expect(environmentChecks("23.1.0", "linux", "Linux")[0]?.status).toBe("error");
  expect(environmentChecks("22.12.0", "linux", "Linux")[0]?.status).toBe("error");
  expect(environmentChecks("24.1.0", "win32", "Windows")[1]?.nextAction).toContain("wsl --install");
  expect(environmentChecks("24.1.0", "linux", "microsoft-standard-WSL2")[1]?.detail).toBe("WSL");
});

function services() {
  return {
    doctor: vi.fn().mockResolvedValue(true),
    initialize: vi.fn(),
    plan: vi.fn(),
    validate: vi.fn(runWorkflow),
    run: vi.fn(),
    session: vi.fn().mockResolvedValue(undefined),
  };
}

test("start reuses configuration and tasks, validates before execution and preserves trust choice", async ({
  project,
}) => {
  await setupRun(project.cwd);
  const context = { ...input(project.cwd, [true]), tasksPath: "tasks.json" };
  const actions = services();
  await start(context, actions);
  expect(actions.initialize).not.toHaveBeenCalled();
  expect(actions.plan).not.toHaveBeenCalled();
  expect(actions.validate).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  expect(actions.run).toHaveBeenCalledWith(expect.objectContaining({ tasksPath: "tasks.json" }));
  expect(actions.run.mock.calls[0]?.[0].trustPlugins).toBeUndefined();
});

test("start initializes a new project, plans once and separates configuration time", async ({
  project,
}) => {
  const context = input(project.cwd, [true]);
  const actions = services();
  actions.initialize.mockImplementation(() => setupRun(project.cwd));
  actions.plan.mockImplementation(() => writeFile(join(project.cwd, "plan.md"), "plan"));
  actions.validate.mockResolvedValue();
  await start(context, actions);
  expect(actions.initialize).toHaveBeenCalledWith(expect.objectContaining({ quick: true }));
  expect(actions.plan).toHaveBeenCalledOnce();
  expect(context.script.messages.join("\n")).toContain("Configuration:");
});

test("start stops on diagnosis or validation failure and never calls the model", async ({
  project,
}) => {
  const context = input(project.cwd);
  const actions = services();
  actions.doctor.mockRejectedValue(new UserError("Environment checks failed", "Repair"));
  await expect(start(context, actions)).rejects.toThrow("Environment checks failed");
  expect(actions.plan).not.toHaveBeenCalled();
  await setupRun(project.cwd);
  actions.doctor.mockResolvedValue(true);
  await writeFile(join(project.cwd, "plan.md"), "invalid plan");
  await expect(start(context, actions)).rejects.toThrow();
  expect(actions.run).not.toHaveBeenCalled();
});

test("start reconnects to an active session without reconfiguring or planning", async ({
  project,
}) => {
  const actions = services();
  actions.session.mockResolvedValue({ id: "existing", status: "running" });
  await start(input(project.cwd), actions);
  expect(actions.doctor).not.toHaveBeenCalled();
  expect(actions.plan).not.toHaveBeenCalled();
  expect(actions.run).toHaveBeenCalledOnce();
});
