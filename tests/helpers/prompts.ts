import { setImmediate } from "node:timers/promises";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";

class TerminalOutput extends PassThrough {
  override end(): this {
    return this;
  }
}

export function promptHarness(): Readonly<{
  context: { input: PassThrough; output: PassThrough; signal: AbortSignal };
  controller: AbortController;
  screen: () => string;
  send: (keys: readonly string[]) => Promise<void>;
}> {
  const input = new PassThrough();
  const output = new TerminalOutput();
  const controller = new AbortController();
  let screen = "";
  output.on("data", (chunk: Buffer) => {
    screen += chunk.toString();
  });
  return {
    context: { input, output, signal: controller.signal },
    controller,
    screen: () => stripVTControlCharacters(screen),
    send: (keys) => sendKeys(input, keys),
  };
}

async function sendKeys(input: PassThrough, keys: readonly string[]): Promise<void> {
  await setImmediate();
  for (const key of keys) {
    input.write(key);
    await setImmediate();
  }
  await setImmediate();
}
