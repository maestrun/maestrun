import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../../config/index.js";
import { DEFAULT_STAGES, STAGES } from "../../contracts/workflow.js";
import type { Assignment, Config } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { ensureStateDirectory } from "../../shared/project-state.js";
import { CancelError, UserError } from "../../shared/errors.js";
import { selectSampleAssignment } from "../workflow/index.js";
import { runSession } from "./run-session.js";
import { initializeSampleGit, type SampleMode } from "./sample-project.js";

function sampleConfig(
  config: Config | undefined,
  assignment: Assignment | undefined,
  mode: SampleMode,
): Config {
  const planning = assignment ?? config?.stages[0];
  if (!planning) throw new UserError("No planning assignment was found.", "Run maestrun init.");
  const maxRepairs = mode === "qa-refactor" ? config?.execution?.maxRepairs : 5;
  return {
    version: 1,
    stages: (mode === "simple" ? DEFAULT_STAGES : STAGES).map((id) => {
      const { executor, model, effort } =
        assignment ?? config?.stages.find((stage) => stage.id === id) ?? planning;
      return { id, executor, model, ...(effort ? { effort } : {}) };
    }),
    execution: {
      mode: mode === "advanced" ? "parallel" : "sequential",
      concurrency: mode === "advanced" ? 2 : 1,
      background: false,
      ...(maxRepairs !== undefined ? { maxRepairs } : {}),
    },
    ...(config?.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
  };
}

export async function prepareSample(
  cwd: string,
  assignment?: Assignment,
  mode: SampleMode = "qa-refactor",
): Promise<string> {
  const { config } = await loadConfig(cwd);
  if (!config && !assignment)
    throw new UserError("No saved workflow was found.", "Run maestrun init, then maestrun sample.");
  const plan = await readFile(
    new URL(`../../../examples/${mode}/plan.md`, import.meta.url),
    "utf8",
  );
  await ensureStateDirectory(cwd);
  const parent = join(cwd, ".maestrun", "samples");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "run-"));
  await saveConfig(directory, sampleConfig(config, assignment, mode), {
    exists: false,
    content: "",
  });
  await writeFile(join(directory, "plan.md"), plan, { flag: "wx" });
  if (mode === "advanced") await initializeSampleGit(directory);
  return directory;
}

export async function runSample(
  input: CommandInput & { background?: boolean; mode?: SampleMode },
): Promise<void> {
  const assignment =
    process.stdin.isTTY && process.stdout.isTTY ? await selectSampleAssignment(input) : undefined;
  if (input.signal.aborted) throw new CancelError();
  const directory = await prepareSample(input.cwd, assignment, input.mode);
  if (input.signal.aborted) throw new CancelError();
  console.log(`Sample project: ${directory}`);
  console.log(
    input.mode === "simple"
      ? "Simple: 2 small sequential tasks — greeting, then blank-name validation. Implementation → Tests."
      : "Advanced: 3 small tasks — add, clamp with QA repair, then compose their results.",
  );
  if (input.mode === "advanced")
    console.log(
      "Expected: QA requests one repair, automatically returning to Implementation before all three tasks complete.",
    );
  try {
    await runSession({ cwd: directory, background: input.background ?? false });
  } finally {
    console.log(`Sample files and run report: ${directory}`);
    console.log("To reopen this sample, change into that directory and run maestrun.");
  }
}
