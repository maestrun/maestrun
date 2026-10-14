import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { gitOutput } from "./worktree-git.js";

export type SampleMode = "simple" | "advanced" | "qa-refactor";

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
