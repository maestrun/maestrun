import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const requiredSections = [
  "What this PR does",
  "Changelog",
  "Breaking changes and migration",
  "Validation",
  "Limitations",
  "Readiness",
];

function getSections(body) {
  const sections = new Map();
  for (const match of body.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const name = match[1].trim();
    if (sections.has(name)) throw new Error(`Duplicate section: ${name}`);
    sections.set(name, match[2].trim());
  }
  return sections;
}

function validateEvidence(validation, draft) {
  const rows = validation.split("\n").filter((line) => /^\|/.test(line));
  const results = rows.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  const evidence = results.filter(
    (cells) => cells[0] !== "Check" && !cells.every((cell) => /^:?-+:?$/.test(cell)),
  );
  if (
    !evidence.length ||
    evidence.some(
      (cells) =>
        cells.length !== 3 ||
        !cells[0] ||
        !cells[2] ||
        !/^(PASS|FAIL|BLOCKED|NOT APPLICABLE)$/.test(cells[1]),
    )
  ) {
    throw new Error(
      "Validation needs a check, result (PASS, FAIL, BLOCKED, NOT APPLICABLE), and evidence or reason.",
    );
  }
  if (!draft && evidence.some((cells) => /^(FAIL|BLOCKED)$/.test(cells[1]))) {
    throw new Error("Keep the PR in draft while validation is FAIL or BLOCKED.");
  }
}

export function validatePullRequest({ title = "", body = "", draft = false }) {
  if (
    title.trim().length < 10 ||
    title.trim().length > 100 ||
    /^(update files|fix bugs?|changes|wip|test|todo)[.! ]*$/i.test(title.trim())
  ) {
    throw new Error("Use a descriptive PR title of 10–100 characters stating the outcome.");
  }
  const content = (body ?? "").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const sections = getSections(content);
  for (const name of requiredSections) {
    if (!sections.get(name) || /^(?:todo|tbd|n\/a|[-\s]*)[.! ]*$/i.test(sections.get(name))) {
      throw new Error(`Fill in the required section: ${name}`);
    }
  }
  const notes = sections
    .get("Changelog")
    .split("\n")
    .filter((line) => line.trim());
  if (!notes.every((line) => /^- (Added|Changed|Fixed|Removed|Internal): \S.*\S$/.test(line))) {
    throw new Error(
      "Changelog needs standalone bullets starting with Added:, Changed:, Fixed:, Removed:, or Internal:.",
    );
  }
  validateEvidence(sections.get("Validation"), draft);
  const readiness = sections.get("Readiness");
  if (!/^- \[[ xX]\] \S/m.test(readiness) || (!draft && /- \[ \]/.test(readiness))) {
    throw new Error("Include the readiness checklist and complete it before marking the PR ready.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { pull_request: pullRequest } = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    if (!pullRequest) throw new Error("Expected a pull_request event.");
    validatePullRequest(pullRequest);
    console.log("PR title and description meet the changelog requirements.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
