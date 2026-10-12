import { expect, test } from "vitest";
import { answer, navigation, withBack } from "./navigation.js";
import { BackError, CancelError } from "./errors.js";

test("Back and Cancel controls cannot collide with model identifiers", () => {
  const choices = navigation([{ name: "back", value: "back" }]);
  expect(answer("back")).toBe("back");
  const back = choices.find((choice) => choice.name === "← Back");
  const cancel = choices.find((choice) => choice.name === "Cancel");
  expect(back).toBeDefined();
  expect(cancel).toBeDefined();
  if (!back || !cancel) throw new Error("Missing navigation controls");
  expect(() => answer(back.value)).toThrow(BackError);
  expect(() => answer(cancel.value)).toThrow(CancelError);
});

test("Escape aborts the current prompt and removes its listener", async () => {
  const listeners = process.stdin.listenerCount("keypress");
  const prompt = withBack(
    (signal) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
        process.stdin.emit("keypress", "", { name: "escape" });
      }),
    new AbortController().signal,
  );
  await expect(prompt).rejects.toThrow(BackError);
  expect(process.stdin.listenerCount("keypress")).toBe(listeners);
});

test("ordinary keys preserve the answer and prompt errors propagate", async () => {
  expect(
    await withBack(async () => {
      process.stdin.emit("keypress", "a", { name: "a" });
      return "answer";
    }, new AbortController().signal),
  ).toBe("answer");
  await expect(
    withBack(async () => {
      throw new Error("Prompt error");
    }, new AbortController().signal),
  ).rejects.toThrow("Prompt error");
});

test("interrupting the wizard takes precedence over Back", async () => {
  const controller = new AbortController();
  await expect(
    withBack(async () => {
      controller.abort();
      process.stdin.emit("keypress", "", { name: "escape" });
      throw new CancelError();
    }, controller.signal),
  ).rejects.toThrow(CancelError);
});
