// Exercise the CLI with a controllable terminal stream in child-process tests.
Object.defineProperty(process.stdin, "isTTY", { value: true });
Object.defineProperty(process.stdout, "isTTY", { value: true });
process.stdout.columns = 120;
process.stdout.rows = 24;
process.stdin.setRawMode = (raw: boolean) => {
  process.stdin.isRaw = raw;
  return process.stdin;
};
await import("../../src/main.js");
