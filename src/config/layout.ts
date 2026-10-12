import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMN_IDS, DEFAULT_LAYOUT } from "../contracts/layout.js";
import type { FlowchartLayout, Layout, LayoutColumn } from "../contracts/layout.js";
import { isRecord } from "../contracts/workflow.js";
import { hasCode } from "../shared/atomic.js";
import { UserError } from "../shared/errors.js";
import { maestrunHome } from "../shared/home.js";

function invalid(path: string, reason: string): never {
  throw new UserError(
    `Invalid layout in ${path}: ${reason}`,
    "Correct layout.json using the README layout settings, or remove it to use defaults.",
  );
}

function keys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) invalid(path, `unknown setting "${unknown}".`);
}

function dimension(value: unknown, minimum: number): value is number | "auto" {
  return value === "auto" || (Number.isSafeInteger(value) && Number(value) >= minimum);
}

function columns(value: unknown, path: string): readonly LayoutColumn[] {
  if (!Array.isArray(value) || !value.length) invalid(path, "columns must be a nonempty array.");
  const result = value.map((column): LayoutColumn => {
    if (!isRecord(column)) invalid(path, "each column must be an object.");
    keys(column, ["id", "width"], path);
    const id = COLUMN_IDS.find((id) => id === column.id);
    if (!id) invalid(path, `column id must be one of: ${COLUMN_IDS.join(", ")}.`);
    const width: unknown = column.width === undefined ? "auto" : column.width;
    if (!dimension(width, 1)) invalid(path, 'column width must be a positive integer or "auto".');
    return { id, width };
  });
  if (new Set(result.map((column) => column.id)).size !== result.length)
    invalid(path, "column ids must be unique.");
  return result;
}

function flowchart(value: unknown, path: string): Partial<FlowchartLayout> {
  if (!isRecord(value)) invalid(path, "flowchart must be an object.");
  keys(value, ["visible", "position", "width", "height"], path);
  if (value.visible !== undefined && typeof value.visible !== "boolean")
    invalid(path, "flowchart.visible must be a boolean.");
  if (
    value.position !== undefined &&
    (typeof value.position !== "string" ||
      !["left", "right", "top", "bottom"].includes(value.position))
  )
    invalid(path, "flowchart.position must be left, right, top or bottom.");
  if (value.width !== undefined && !dimension(value.width, 20))
    invalid(path, 'flowchart.width must be an integer of at least 20 or "auto".');
  if (value.height !== undefined && !dimension(value.height, 9))
    invalid(path, 'flowchart.height must be an integer of at least 9 or "auto".');
  return value as Partial<FlowchartLayout>;
}

function readLayout(path: string): Partial<Omit<Layout, "flowchart">> & {
  flowchart?: Partial<FlowchartLayout>;
} {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) return {};
    throw new UserError(
      `Could not read layout file ${path}.`,
      "Check its file permissions and retry.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    invalid(path, "expected valid JSON.");
  }
  if (!isRecord(value)) invalid(path, "expected an object.");
  keys(value, ["columns", "flowchart"], path);
  return {
    ...(value.columns !== undefined ? { columns: columns(value.columns, path) } : {}),
    ...(value.flowchart !== undefined ? { flowchart: flowchart(value.flowchart, path) } : {}),
  };
}

export function loadLayout(cwd: string): Layout {
  const global = readLayout(join(maestrunHome(), "layout.json"));
  const project = readLayout(join(cwd, ".maestrun", "layout.json"));
  return {
    ...global,
    ...project,
    flowchart: { ...DEFAULT_LAYOUT.flowchart, ...global.flowchart, ...project.flowchart },
  };
}
