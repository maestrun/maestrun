import type { Command } from "commander";
import { runSample, SAMPLE_DESCRIPTIONS, type SampleMode } from "./modules/execution/index.js";
import { interactive } from "./cli.js";

type SampleOptions = { background?: boolean };

function startSample(mode: SampleMode, options: SampleOptions): Promise<void> {
  return interactive("sample", (input) => runSample({ ...input, ...options, mode }), false);
}

export function registerSample(program: Command): void {
  const sample = program.command("sample").description("Run a quick two-task sequential sample");
  sample
    .option("--background", "Run the sample in the background")
    .action(async (options: SampleOptions) => startSample("simple", options));
  for (const mode of ["advanced", "run", "orchestrator-plan", "orchestrator-agent"] as const)
    sample
      .command(mode)
      .description(SAMPLE_DESCRIPTIONS[mode === "run" ? "qa-refactor" : mode])
      .option("--background", "Run the sample in the background")
      .action(async (options: SampleOptions) =>
        startSample(mode === "run" ? "qa-refactor" : mode, { ...sample.opts(), ...options }),
      );
}
