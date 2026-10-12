import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Draft } from "../../contracts/workflow.js";
import type { CommandInput } from "../../shared/command.types.js";
import { atomicWrite, hasCode } from "../../shared/atomic.js";
import { CancelError, UserError, fileFailure } from "../../shared/errors.js";
import { parseTaskDocument } from "../execution/index.js";

export const ADVANCED_FORMAT = [
  "Create an advanced plan with three complete documents, in this exact order.",
  "Put each marker on its own line, once, outside code fences:",
  "<!-- maestrun:prd -->",
  "# Product requirements document",
  "Include the problem, users, measurable goals, scope, non-goals, requirements with stable IDs, and acceptance criteria.",
  "<!-- maestrun:techspec -->",
  "# Technical specification",
  "Derive architecture, interfaces, data changes, error handling, rollout, risks and testing strategy from the PRD. Reference requirement IDs.",
  "<!-- maestrun:tasks -->",
  "# Implementation tasks",
  "Derive ordered tasks from the PRD and technical specification, with dependencies, requirement references, acceptance criteria and verification.",
  "Write runnable Markdown task sections only in the tasks document. Keep task instructions self-contained.",
  "Include assumptions and unresolved questions in the relevant document. Use relative links prd.md, techspec.md and tasks.md between documents.",
  "Maestrun will split this response into prd.md, techspec.md and tasks.md inside the selected folder. Do not create files yourself.",
].join("\n");

function validateFolder(folder: string): void {
  if (!folder.trim() || folder.startsWith(".") || /[/\\\p{Cc}\p{Cf}]/u.test(folder))
    throw new UserError(
      "Use a visible folder name inside the project.",
      "For example: tasks or checkout-planning.",
    );
}

async function requireNewFolder(cwd: string, folder: string): Promise<void> {
  validateFolder(folder);
  try {
    await lstat(join(cwd, folder));
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw fileFailure("Could not check the planning folder.");
  }
  throw new UserError(
    `The planning folder ${folder} already exists.`,
    "Choose a new folder name to preserve existing files.",
  );
}

export async function selectPlanFolder(context: CommandInput, initial = "tasks"): Promise<string> {
  let folder = initial;
  while (true) {
    folder = (await context.ui.input("Advanced plan folder name", folder)).trim() || "tasks";
    try {
      await requireNewFolder(context.cwd, folder);
      return folder;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      context.ui.log(`${error.message} ${error.nextAction}`);
    }
  }
}

function documents(content: string): readonly string[] {
  const parts = content
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/u, "$1")
    .split(/^<!-- maestrun:(prd|techspec|tasks) -->\s*$/gmu);
  if (
    parts.length !== 7 ||
    parts[0]?.trim() ||
    parts[1] !== "prd" ||
    parts[3] !== "techspec" ||
    parts[5] !== "tasks" ||
    [2, 4, 6].some((index) => !parts[index]?.trim())
  )
    throw new UserError(
      "The executor returned an incomplete advanced plan.",
      "Retry planning; the response must include PRD, technical specification and tasks documents.",
    );
  return [parts[2] ?? "", parts[4] ?? "", parts[6] ?? ""].map((part) => `${part.trim()}\n`);
}

export async function saveAdvancedPlan(
  context: CommandInput,
  draft: Draft,
  content: string,
): Promise<string> {
  const sections = documents(content);
  parseTaskDocument(sections[2] ?? "");
  const folder = draft.planFolder ?? "tasks";
  await requireNewFolder(context.cwd, folder);
  if (context.signal.aborted) throw new CancelError();
  await mkdir(join(context.cwd, folder)).catch(() => {
    throw fileFailure("Could not create the advanced plan folder.");
  });
  const names = ["prd.md", "techspec.md", "tasks.md"];
  for (const [index, section] of sections.entries())
    await atomicWrite(join(context.cwd, folder, names[index] ?? "tasks.md"), section, {
      exists: false,
      content: "",
    });
  context.ui.log(`Planning documents saved: ${join(context.cwd, folder)}`);
  const links = names
    .map((name) => `- [${name}](<${encodeURIComponent(folder)}/${name}>)`)
    .join("\n");
  return `## Planning documents\n\n${links}\n`;
}
