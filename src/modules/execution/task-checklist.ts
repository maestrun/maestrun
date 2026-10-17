import { resolve } from "node:path";
import type { TaskState } from "../../contracts/run.js";
import { atomicWrite, snapshotFile } from "../../shared/atomic.js";
import { markdownStructure } from "./task-markdown.js";

type ChecklistTask = Pick<TaskState, "id" | "title"> & Partial<Pick<TaskState, "status">>;
const BLOCK = /^<!-- maestrun:checklist -->\r?\n[\s\S]*?^<!-- \/maestrun:checklist -->/mu;

export function taskChecklist(content: string, tasks: readonly ChecklistTask[]): string {
  const lines = tasks
    .filter((task) => task.id !== "__orchestrator__")
    .map((task) => {
      const title = task.title.replace(/[\\`*_[\]<>]/gu, "\\$&");
      return `- [${task.status === "completed" ? "x" : " "}] ${task.id}: ${title}`;
    });
  const block = [
    "<!-- maestrun:checklist -->",
    "## Progress checklist",
    "",
    ...lines,
    "<!-- /maestrun:checklist -->",
  ].join("\n");
  const previous = BLOCK.exec(markdownStructure(content));
  if (previous)
    return (
      content.slice(0, previous.index) + block + content.slice(previous.index + previous[0].length)
    );
  const heading = /^# [^\n]+\n/u.exec(content)?.[0] ?? "";
  return `${heading}\n${block}\n\n${content.slice(heading.length).trimStart()}`.trimStart();
}

export async function saveTaskChecklist(
  cwd: string,
  tasksPath: string,
  tasks: readonly ChecklistTask[],
): Promise<void> {
  if (!tasksPath.endsWith(".md")) return;
  const path = resolve(cwd, tasksPath);
  const saved = await snapshotFile(path);
  if (!saved.exists) return;
  const updated = taskChecklist(saved.content, tasks);
  if (updated !== saved.content) await atomicWrite(path, updated, saved);
}
