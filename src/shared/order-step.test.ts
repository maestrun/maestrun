import { setImmediate } from "node:timers/promises";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "vitest";
import type { StageId } from "../contracts/workflow.js";
import { orderStepPrompt } from "./order-step.js";

const IDS = ["planning", "implementation", "custom:Existing", "review", "custom:Audit"] as const;

async function prompt(ids: readonly StageId[] = IDS): Promise<{
  input: PassThrough;
  result: Promise<readonly StageId[]>;
  screen: () => string;
  controller: AbortController;
}> {
  const input = new PassThrough();
  const output = new PassThrough();
  const controller = new AbortController();
  let screen = "";
  output.on("data", (chunk: Buffer) => {
    screen += chunk.toString();
  });
  const result = orderStepPrompt(
    { ids, step: "custom:Audit" },
    { input, output, signal: controller.signal },
  );
  await setImmediate();
  return { input, result, controller, screen: () => stripVTControlCharacters(screen) };
}

async function keys(input: PassThrough, values: readonly string[]): Promise<void> {
  for (const value of values) {
    input.write(value);
    await setImmediate();
  }
}

test("shows every numbered step and moves the new step through the list", async () => {
  const active = await prompt();
  for (const label of ["1. Planning", "2. Implementation", "3. Existing", "4. Review", "5. Audit"])
    expect(active.screen()).toContain(label);
  await keys(active.input, ["\u001b[A", "\u001b[A"]);
  expect(active.screen()).toContain("❯ 3. Audit (new)");
  await keys(active.input, ["\r"]);
  expect(await active.result).toEqual([
    "planning",
    "implementation",
    "custom:Audit",
    "custom:Existing",
    "review",
  ]);
  expect(IDS).toEqual(["planning", "implementation", "custom:Existing", "review", "custom:Audit"]);
});

test("movement stops below planning and at the end without wrapping", async () => {
  const active = await prompt();
  await keys(
    active.input,
    Array.from({ length: IDS.length }, () => "\u001b[A"),
  );
  expect(active.screen()).toContain("❯ 2. Audit (new)");
  await keys(
    active.input,
    Array.from({ length: IDS.length }, () => "\u001b[B"),
  );
  await keys(active.input, ["\r"]);
  expect(await active.result).toEqual(IDS);
});

test("a planning-only workflow confirms its only valid insertion point", async () => {
  const active = await prompt(["planning", "custom:Audit"]);
  await keys(active.input, ["\u001b[A", "\u001b[B", "x", "\r"]);
  expect(await active.result).toEqual(["planning", "custom:Audit"]);
});

test("cancelling aborts ordering and removes its keypress listener", async () => {
  const active = await prompt();
  const rejected = expect(active.result).rejects.toMatchObject({ name: "AbortPromptError" });
  active.controller.abort();
  await rejected;
  expect(active.input.listenerCount("keypress")).toBe(0);
});
