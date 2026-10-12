import type { Guidance, GuidanceFile } from "../../contracts/workflow.js";

function renderFile(file: GuidanceFile): string {
  const runs = file.content.match(/`+/gu) ?? [];
  const fence = "`".repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  const path = file.path.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
  return `### ${path}\n\n${fence}text\n${file.content}\n${fence}`;
}

export function renderGuidance(guidance?: Guidance): string {
  if (!guidance) return "";
  return [
    "## Project skills",
    "",
    guidance.skills.length ? guidance.skills.map(renderFile).join("\n\n") : "None found.",
    "",
    "## Project rules",
    "",
    guidance.rules.length ? guidance.rules.map(renderFile).join("\n\n") : "None found.",
  ].join("\n");
}
