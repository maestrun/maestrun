import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { gitOutput } from "./worktree-git.js";

export const SAMPLE_DESCRIPTIONS = {
  simple:
    "Simple: 2 small sequential tasks — greeting, then blank-name validation. Implementation → Tests.",
  advanced:
    "Advanced: 5 small tasks — an approval on hold, an independent failure, add, clamp with QA repair, then compose.",
  "qa-refactor":
    "QA repair: 3 small tasks — add, clamp with QA repair, then compose their results.",
  "orchestrator-plan":
    "Orchestrator plan: 6 predefined tasks, 11 worker stages. F flowchart · D tasks/steps · V direction.",
  "orchestrator-agent":
    "Orchestrator agent: 1 objective becomes 6 tasks. Target: 2 coordination calls + 11 worker stages. F flowchart · D tasks/steps · V direction.",
} as const;
export type SampleMode = keyof typeof SAMPLE_DESCRIPTIONS;

export async function initializeSampleGit(cwd: string): Promise<void> {
  await appendFile(join(cwd, ".gitignore"), ".maestrun/*\n");
  await gitOutput(cwd, ["init", "--template="]);
  await gitOutput(cwd, ["add", "--", ".gitignore"]);
  await gitOutput(cwd, ["commit", "-m", "Initialize Maestrun advanced sample"], {
    env: {
      GIT_AUTHOR_NAME: "Maestrun",
      GIT_AUTHOR_EMAIL: "maestrun@localhost",
      GIT_COMMITTER_NAME: "Maestrun",
      GIT_COMMITTER_EMAIL: "maestrun@localhost",
    },
  });
}
