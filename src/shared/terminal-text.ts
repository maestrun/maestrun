import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function cleanText(value: string): string {
  return stripVTControlCharacters(value).replace(/[\p{Cc}\p{Cf}]/gu, (char) =>
    char === "\u200d" ? char : " ",
  );
}

export function cell(value: string, width: number): string {
  if (width < 1) return "";
  const text = cleanText(value);
  if (stringWidth(text) <= width) return text.padEnd(text.length + width - stringWidth(text));
  let clipped = "";
  for (const { segment } of GRAPHEMES.segment(text)) {
    if (stringWidth(clipped + segment) > width - 1) break;
    clipped += segment;
  }
  return `${clipped}…`.padEnd(clipped.length + 1 + width - stringWidth(`${clipped}…`));
}

export function wrapText(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const { segment } of GRAPHEMES.segment(cleanText(value))) {
    if (line && stringWidth(line + segment) > width) {
      lines.push(line);
      line = "";
    }
    line += segment;
  }
  if (line) lines.push(line);
  return lines;
}
