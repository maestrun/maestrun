import type { Command } from "commander";
import { runSample, type SampleMode } from "./modules/execution/index.js";
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
  for (const mode of ["advanced", "run"] as const)
    sample
      .command(mode)
      .description(
        mode === "advanced"
          ? "Parallel tasks, one QA repair, on hold, independent failure and integration"
          : "Original sequential QA repair demo",
      )
      .option("--background", "Run the sample in the background")
      .action(async (options: SampleOptions) =>
        startSample(mode === "run" ? "qa-refactor" : mode, { ...sample.opts(), ...options }),
      );
}
