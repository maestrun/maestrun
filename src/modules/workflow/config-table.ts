import stringWidth from "string-width";
import type { Assignment, Config } from "../../contracts/workflow.js";
import { DEFAULT_MAX_REPAIRS, executorLabel, stageLabel } from "../../contracts/workflow.js";
import { cell, cleanText } from "../../shared/terminal-text.js";

function table(rows: readonly (readonly string[])[]): string {
  const clean = rows.map((row) => row.map(cleanText));
  const widths =
    clean[0]?.map((_, i) => Math.max(...clean.map((row) => stringWidth(row[i] ?? "")))) ?? [];
  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const lines = clean.map(
    (row) => `| ${row.map((value, i) => cell(value, widths[i] ?? 0)).join(" | ")} |`,
  );
  return [border, lines[0], border, ...lines.slice(1), border].join("\n");
}

function assignmentRow(label: string, assignment: Assignment, file = "—"): string[] {
  return [
    label,
    executorLabel(assignment.executor),
    assignment.model,
    assignment.effort ?? "default",
    file,
  ];
}

export function configTable(config: Config): string {
  const assignments = config.stages.map((stage) =>
    assignmentRow(stageLabel(stage.id), stage, stage.file),
  );
  for (const target of ["frontend", "backend"] as const) {
    const assignment = config.targets?.[target];
    if (assignment) assignments.push(assignmentRow(`${target} implementation`, assignment));
  }
  return [
    table([["Stage / target", "Executor", "Model", "Effort", "Instructions"], ...assignments]),
    table([
      ["Setting", "Value"],
      ["Config version", String(config.version)],
      ["Execution", config.execution?.mode ?? "sequential"],
      ["Orchestrator", config.execution?.orchestrator ?? "off"],
      ...(config.execution?.orchestrator ? [["Task steps", "Defined per task in plan.md"]] : []),
      ["Concurrency", String(config.execution?.concurrency ?? 2)],
      ["Automatic repairs per task", String(config.execution?.maxRepairs ?? DEFAULT_MAX_REPAIRS)],
      ["Parallel isolation", "Git worktree per task"],
      ["Background", config.execution?.background ? "yes" : "no"],
      ["Stage timeout", `${config.timeoutMs ?? 600000} ms`],
      ["Plugins", config.plugins?.join(", ") || "none"],
    ]),
  ].join("\n");
}
