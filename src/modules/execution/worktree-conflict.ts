import { randomUUID } from "node:crypto";
import type { TaskState, TaskWorktree } from "../../contracts/run.js";
import type { RunContext } from "./execution.types.js";
import { UserError } from "../../shared/errors.js";
import { gitOutput } from "./worktree-git.js";
import { worktreePath } from "./task-worktree.js";

function conflictIndex(output: string): { tree: string; entries: string } {
  const [tree = "", ...fields] = output.split("\0");
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(tree)) throw new Error("Invalid conflict tree");
  const entries = fields.slice(0, fields.indexOf(""));
  const paths = entries.map((entry) => {
    if (!/^\d{6} [a-f0-9]+ [123]\t/u.test(entry)) throw new Error("Invalid conflict index");
    return entry.slice(entry.indexOf("\t") + 1);
  });
  if (!entries.length)
    throw new UserError(
      "Git reported a conflict without index entries.",
      "Inspect the retained task worktree and resolve its changes manually.",
    );
  const remove = [...new Set(paths)].map((path) => `0 ${"0".repeat(tree.length)}\t${path}`);
  return { tree, entries: [...remove, ...entries].join("\0") + "\0" };
}

export async function preserveConflict(
  context: RunContext,
  state: TaskState,
  merge: { current: string; output: string },
): Promise<never> {
  if (!state.worktree) throw new Error("Missing conflicting worktree");
  const previous = state.worktree;
  const recovery: TaskWorktree = {
    id: randomUUID(),
    base: merge.current,
    resolving: true,
    retained: retainedWorktrees(previous),
  };
  const path = worktreePath(context.cwd, recovery);
  const conflict = conflictIndex(merge.output);
  await gitOutput(context.cwd, ["worktree", "add", "--detach", path, recovery.base]);
  await gitOutput(path, ["read-tree", "--reset", "-u", conflict.tree]);
  await gitOutput(path, ["update-index", "-z", "--index-info"], { input: conflict.entries });
  state.worktree = recovery;
  await context.update(state);
  throw new UserError(
    `Integration conflict for task ${state.id}.`,
    `Resolve and test the files in ${path}, then use git add to mark them resolved and rerun the same Maestrun command from the project. Original changes remain in ${worktreePath(context.cwd, previous)}. The main project was not changed by this integration.`,
  );
}

export function retainedWorktrees(previous: TaskWorktree): NonNullable<TaskWorktree["retained"]> {
  return [
    ...(previous.retained ?? []),
    {
      id: previous.id,
      base: previous.base,
      ...(previous.workspace ? { workspace: previous.workspace } : {}),
    },
  ];
}
