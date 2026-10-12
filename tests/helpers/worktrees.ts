import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "../../src/contracts/workflow.js";
import type { RunReport } from "../../src/contracts/run.js";
import type { CommandInput } from "../../src/shared/command.types.js";
import { RUN_CONFIG } from "./run.js";
import { scriptedUi } from "./ui.js";

export const PARALLEL: Config = { ...RUN_CONFIG, execution: { mode: "parallel", concurrency: 2 } };
export function runInput(cwd: string): CommandInput & { tasksPath: string } {
  return {
    cwd,
    tasksPath: "tasks.json",
    ui: scriptedUi([]).ui,
    signal: new AbortController().signal,
  };
}
export async function savedReport(cwd: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(cwd, ".maestrun/run.json"), "utf8")) as RunReport;
}
