import type { Task } from "../../contracts/tasks.js";
import { UserError } from "../../shared/errors.js";

// Ignore headings and links inside code examples, retaining offsets into the original text.
export function markdownStructure(text: string): string {
  let fence = "";
  return text
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1]?.[0] === fence[0] &&
          (marker[1]?.length ?? 0) >= fence.length &&
          !marker[2]?.trim()
        )
          fence = "";
        return " ".repeat(line.length);
      }
      if (marker) {
        fence = marker[1] ?? "";
        return " ".repeat(line.length);
      }
      return line;
    })
    .join("\n");
}

export function taskDocumentLinks(text: string): readonly string[] {
  const structure = markdownStructure(text);
  if (/^#{1,6} Task /mu.test(structure) || /^```maestrun-tasks\s*$/mu.test(text)) return [];
  const index = [
    ...structure.matchAll(
      /^-[ \t]+\[[ xX]\][ \t]+\[[^\]\n]+\]\((?:<([^>\n]+\.md)>|([^\s)]+\.md))\)[ \t]*$/gmu,
    ),
  ];
  const root = [...structure.matchAll(/\[tasks\.md\]\((?:<([^>]+)>|([^\s)]+))\)/gu)];
  if (root.length > 1 || (root.length && index.length))
    throw new UserError(
      "Invalid task plan: ambiguous task document links.",
      "Use one tasks.md link or a checklist linking individual task files.",
    );
  return (index.length ? index : root).map((link) => link[1] ?? link[2] ?? "");
}

export function markdownTasks(text: string): readonly Task[] {
  const headings = [...markdownStructure(text).matchAll(/^(#{1,6})[ \t]+(.+)$/gmu)];
  return headings.flatMap((heading, index) => {
    const task = /^Task ([^:]+):[ \t]*(.*)$/u.exec(heading[2] ?? "");
    if (!task) return [];
    const end = headings
      .slice(index + 1)
      .find((next) => (next[1]?.length ?? 0) <= (heading[1]?.length ?? 0));
    const body = text.slice((heading.index ?? 0) + heading[0].length, end?.index).trim();
    return [markdownTask(task[1] ?? "", task[2] ?? "", body)];
  });
}

function readMetadata(id: string, lines: string[]): Map<string, string> {
  const metadata = new Map<string, string>();
  while (lines.length) {
    if (!lines[0]?.trim()) {
      lines.shift();
      continue;
    }
    const field = /^- (Depends on|Target|Steps|Parent|Agents|Repairs):[ \t]*(.*)$/u.exec(
      lines[0] ?? "",
    );
    if (!field) break;
    const key = field[1] ?? "";
    if (metadata.has(key))
      throw new UserError(
        `Invalid task plan: duplicate ${key} in ${id}.`,
        "Fix the task metadata.",
      );
    metadata.set(key, field[2]?.trim() ?? "");
    lines.shift();
  }
  return metadata;
}

function markdownTask(id: string, title: string, body: string): Task {
  const lines = body.split("\n");
  const metadata = readMetadata(id, lines);
  const dependencies = metadata.get("Depends on");
  if (!dependencies)
    throw new UserError(
      `Invalid task plan: ${id} needs Depends on.`,
      "Use - Depends on: none or comma-separated task ids.",
    );
  const target = metadata.get("Target");
  const steps = metadata.get("Steps");
  if (target !== undefined && target !== "frontend" && target !== "backend")
    throw new UserError(
      `Invalid task plan: ${id} has an unknown target.`,
      "Use frontend or backend.",
    );
  return {
    id,
    title,
    instructions: lines.join("\n").trim(),
    dependsOn: dependencies === "none" ? [] : dependencies.split(",").map((value) => value.trim()),
    ...(target ? { target } : {}),
    ...(steps !== undefined
      ? { steps: steps.split(",").map((value) => value.trim()) as NonNullable<Task["steps"]> }
      : {}),
    ...(metadata.has("Parent") ? { parentId: metadata.get("Parent") ?? "" } : {}),
    ...(metadata.has("Repairs") ? { repairFor: metadata.get("Repairs") ?? "" } : {}),
    ...(metadata.has("Agents") ? { agents: agentMetadata(metadata.get("Agents") ?? "") } : {}),
  };
}

function agentMetadata(text: string): NonNullable<Task["agents"]> {
  try {
    return JSON.parse(text) as NonNullable<Task["agents"]>;
  } catch {
    throw new UserError(
      "Invalid task plan: Agents must be a JSON object.",
      'Use - Agents: {"review":"path/to/reviewer.md"}.',
    );
  }
}
