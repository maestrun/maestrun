import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCommand } from "../../shared/process.js";
import type { CommandResult } from "../../shared/process.js";
import { UserError } from "../../shared/errors.js";

type GitOptions = { env?: NodeJS.ProcessEnv; input?: string; signal?: AbortSignal };

export function gitCommand(
  cwd: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<CommandResult> {
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"])
    delete env[key];
  return runCommand({
    executable: "git",
    cwd,
    args: ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    timeoutMs: 120000,
    ...options,
    env: { ...env, GIT_TERMINAL_PROMPT: "0", ...options.env },
  });
}

export async function gitOutput(
  cwd: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<string> {
  const result = await gitCommand(cwd, args, options);
  if (result.code !== 0)
    throw new UserError(
      `Git ${args[0]} failed.`,
      "Inspect the repository and retained worktree. Resolve the Git error before retrying; no task worktree is discarded on failure.",
    );
  return result.stdout.trim();
}

export async function checkWorktreeRepository(cwd: string): Promise<string> {
  const version = (await gitOutput(cwd, ["--version"])).match(/(\d+)\.(\d+)/u);
  if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 38))
    throw new UserError(
      "Parallel execution requires Git 2.38 or newer.",
      "Update Git or use maestrun config execution sequential.",
    );
  const repository = await gitCommand(cwd, ["rev-parse", "--show-toplevel"]);
  if (repository.code !== 0)
    throw new UserError(
      "Parallel execution requires a Git repository.",
      "Initialize Git and review a baseline commit, or use maestrun config execution sequential.",
    );
  const root = repository.stdout.trim();
  if ((await realpath(cwd)) !== (await realpath(root)))
    throw new UserError(
      "Parallel execution must start at the Git repository root.",
      `Run Maestrun from ${root}, or use sequential execution.`,
    );
  const head = await gitCommand(cwd, ["rev-parse", "--verify", "HEAD"]);
  if (head.code !== 0)
    throw new UserError(
      "Parallel execution needs an initial Git commit.",
      "Review and commit the project baseline, or use maestrun config execution sequential.",
    );
  await checkGitIndex(cwd);
  return head.stdout.trim();
}

async function checkGitIndex(cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
  if (
    (await gitOutput(cwd, ["ls-files", "-u"], env ? { env } : {})) ||
    (await gitOutput(cwd, ["ls-files", "--stage"], env ? { env } : {}))
      .split("\n")
      .some((line) => line.startsWith("160000 "))
  )
    throw new UserError(
      "Unresolved merges or submodules prevent isolated execution.",
      "Resolve the merge or run this project sequentially. Submodule worktree isolation is not supported.",
    );
}

export async function snapshotWorktree(cwd: string, parent: string): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "maestrun-index-"));
  const env = { GIT_INDEX_FILE: join(temporary, "index") };
  try {
    await gitOutput(cwd, ["read-tree", parent], { env });
    await gitOutput(cwd, ["add", "--all", "--", ".", ":(top,exclude).maestrun"], { env });
    await gitOutput(cwd, ["rm", "-r", "--cached", "--ignore-unmatch", "--", ".maestrun"], { env });
    await checkGitIndex(cwd, env);
    const tree = await gitOutput(cwd, ["write-tree"], { env });
    return await gitOutput(
      cwd,
      ["commit-tree", tree, "-p", parent, "-m", "Maestrun isolated task snapshot"],
      {
        env: {
          ...env,
          GIT_AUTHOR_NAME: "Maestrun",
          GIT_AUTHOR_EMAIL: "maestrun@localhost",
          GIT_COMMITTER_NAME: "Maestrun",
          GIT_COMMITTER_EMAIL: "maestrun@localhost",
        },
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function commonGitDirectory(cwd: string): Promise<string> {
  return realpath(resolve(cwd, await gitOutput(cwd, ["rev-parse", "--git-common-dir"])));
}
