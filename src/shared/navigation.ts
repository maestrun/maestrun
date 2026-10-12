import { BackError, CancelError } from "./errors.js";
import type { Choice } from "./ui.types.js";

const BACK = Symbol("back");
const CANCEL = Symbol("cancel");

export function navigation(
  choices: readonly Choice[],
): readonly (Choice | { name: string; value: symbol })[] {
  return [...choices, { name: "← Back", value: BACK }, { name: "Cancel", value: CANCEL }];
}

export function answer(value: string | symbol): string {
  if (value === BACK) throw new BackError();
  if (typeof value === "symbol") throw new CancelError();
  return value;
}

export async function withBack<T>(
  task: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const back = new AbortController();
  const onKey = (_text: string, key: { name?: string }): void => {
    if (key.name === "escape") back.abort();
  };
  process.stdin.on("keypress", onKey);
  try {
    return await task(AbortSignal.any([back.signal, signal]));
  } catch (error) {
    if (back.signal.aborted && !signal.aborted) throw new BackError();
    throw error;
  } finally {
    process.stdin.removeListener("keypress", onKey);
  }
}
