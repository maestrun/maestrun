import type { Ui } from "./ui.types.js";

export type CommandInput = Readonly<{
  cwd: string;
  signal: AbortSignal;
  ui: Ui;
}>;
