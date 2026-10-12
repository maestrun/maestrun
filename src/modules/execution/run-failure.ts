import type { RunReport } from "../../contracts/run.js";
import { cleanText } from "../../shared/terminal-text.js";

export function failureSummary(report: RunReport): string {
  const failed = report.tasks.filter(
    (task) => task.status === "failed" || task.status === "refactor",
  );
  const blocked = report.tasks.filter((task) => task.status === "blocked");
  return [
    ...failed.map(
      (task) =>
        `Failed ${task.id} (${task.title}), step ${task.step ?? "unknown"}: ${task.error ?? "Inspect the saved evidence."}`,
    ),
    ...(blocked.length
      ? [`Blocked: ${blocked.map((task) => `${task.id} (${task.title})`).join(", ")}`]
      : []),
  ]
    .map(cleanText)
    .join("\n");
}
