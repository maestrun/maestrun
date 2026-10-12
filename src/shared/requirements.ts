import { open, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Requirements } from "../contracts/workflow.js";
import { UserError, fileFailure } from "./errors.js";

const MAX_REQUIREMENTS_BYTES = 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".maestrun"]);
export type FileEntry = Readonly<{
  name: string;
  path: string;
  directory: boolean;
}>;

export async function listDirectory(path: string): Promise<readonly FileEntry[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter(
        (entry) => (entry.isFile() || entry.isDirectory()) && !SKIPPED_DIRECTORIES.has(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        path: resolve(path, entry.name),
        directory: entry.isDirectory(),
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  } catch {
    throw fileFailure("Could not list this directory.");
  }
}

function decodeRequirements(content: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    if (text.includes("\0")) throw new Error("Binary content");
    return validateRequirements(text);
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw fileFailure("Requirements must be a UTF-8 text file.");
  }
}

export function validateRequirements(text: string): string {
  if (!text.trim())
    throw new UserError(
      "Requirements cannot be empty.",
      "Select a nonempty requirements file or enter a description.",
    );
  if (Buffer.byteLength(text) > MAX_REQUIREMENTS_BYTES)
    throw new UserError(
      "Requirements exceed 1 MiB.",
      "Select a smaller file or shorten the description.",
    );
  return text.trim();
}

export async function readRequirements(cwd: string, file: string): Promise<Requirements> {
  const path = resolve(cwd, file);
  const handle = await open(path, "r").catch(() => {
    throw fileFailure(`Could not open ${basename(path)}.`);
  });
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw fileFailure("Select a regular requirements file.");
    if (stat.size > MAX_REQUIREMENTS_BYTES)
      throw new UserError("Requirements exceed 1 MiB.", "Select a smaller requirements file.");
    const content = await handle.readFile();
    return { text: decodeRequirements(content), source: path };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw fileFailure(`Could not read ${basename(path)}.`);
  } finally {
    await handle.close();
  }
}
