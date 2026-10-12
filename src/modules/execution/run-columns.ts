import { cell } from "../../shared/terminal-text.js";
import { COLUMN_IDS } from "../../contracts/layout.js";
import type { LayoutColumn } from "../../contracts/layout.js";

function defaultRow(values: readonly string[], width: number): string {
  const sizes =
    width >= 110
      ? [12, width - 105, 16, 13, 18, 23, 8, 8]
      : width >= 80
        ? [10, width - 58, 16, 13, 8, 6]
        : width >= 50
          ? [8, width - 41, 16, 8, 5]
          : [7, width - 25, 16];
  const columns =
    width >= 110
      ? [0, 1, 7, 2, 3, 4, 5, 6]
      : width >= 80
        ? [0, 1, 7, 2, 5, 6]
        : width >= 50
          ? [0, 1, 7, 5, 6]
          : [0, 1, 7];
  return columns.map((column, i) => cell(values[column] ?? "", sizes[i] ?? 0)).join(" ");
}

export function row(
  values: readonly string[],
  width: number,
  columns?: readonly LayoutColumn[],
): string {
  if (!columns) return defaultRow(values, width);
  // Keep earlier columns first when the terminal cannot fit the requested widths.
  const visible: LayoutColumn[] = [];
  let remaining = width;
  for (const column of columns) {
    if (remaining < 1) break;
    const size =
      column.width === "auto" ? Math.min(12, remaining) : Math.min(column.width, remaining);
    visible.push({ ...column, width: size });
    remaining -= size + 1;
  }
  let extra = Math.max(0, remaining + 1);
  let count = visible.filter((_, index) => columns[index]?.width === "auto").length;
  return visible
    .map((column, index) => {
      let size = Number(column.width);
      if (columns[index]?.width === "auto") {
        const share = Math.floor(extra / count--);
        size += share;
        extra -= share;
      }
      return cell(values[COLUMN_IDS.indexOf(column.id)] ?? "", size);
    })
    .join(" ");
}
