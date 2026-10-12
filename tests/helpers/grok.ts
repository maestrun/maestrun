import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import type { Project } from "./project.js";

const SCRIPT = `
const { appendFileSync, existsSync, readFileSync, statSync } = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.ORK_TEST_MODE;
const emit = (value) => console.log(JSON.stringify(value));
if (args.includes('--version')) { console.log('grok 1.0.50'); process.exit(0); }
if (args.includes('--help')) {
  console.log(mode === 'old' ? 'old' : '--prompt-file --sandbox --tools --deny --permission-mode streaming-messages-json --include-partial-messages --reasoning-effort --session-id --resume');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log(mode === 'no-auth' ? 'You are not authenticated.' : 'You are logged in with grok.com.');
  console.log(mode === 'bad-catalog' ? 'invalid' : '\\nDefault model: grok-test\\n\\nAvailable models:\\n  * grok-test (default)\\n  - grok-other');
  process.exit(0);
}
const path = args[args.indexOf('--prompt-file') + 1];
const input = readFileSync(path, 'utf8');
appendFileSync(process.env.ORK_TEST_LOG, JSON.stringify({ args, input, mode: statSync(path).mode & 0o777 }) + '\\n');
if (mode === 'hang') { setInterval(() => {}, 1000); }
else if (mode === 'failure') { console.error('401 unauthorized'); process.exit(1); }
else if (mode === 'malformed') { console.log('invalid JSON'); }
else {
  const model = args[args.indexOf('--model') + 1];
  const partial = (text) => emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
  const finish = () => {
    let text = '## Plan\\nAcceptance criteria: implement the requested change.';
    if (input.includes('For this interactive exchange')) text = JSON.stringify(input.includes('User answers:')
      ? { plan: text } : { questions: [{ id: 'scope', question: 'Scope?' }] });
    else if (args.includes('workspace')) text = JSON.stringify({ status: mode === 'refactor' ? 'refactor' : 'completed', summary: input.includes('Run only the') ? 'Checks passed' : input });
    partial(text);
    if (mode !== 'incomplete') emit({ type: 'result', subtype: 'success', is_error: false,
      result: mode === 'empty' ? '' : text, stop_reason: mode === 'truncated' ? 'max_tokens' : 'end_turn',
      modelUsage: { [mode === 'wrong-model' ? 'grok-other' : model]: { inputTokens: 10, outputTokens: 4, cacheReadInputTokens: 2 } } });
  };
  if (mode === 'conversation') {
    partial('Working on the task');
    const timer = setInterval(() => {
      if (!existsSync('.finish-execution')) return;
      clearInterval(timer); finish();
    }, 10);
  } else finish();
}
`;

export async function installGrok(project: Project, mode = "success"): Promise<void> {
  const path = join(project.bin, "grok");
  await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
  await chmod(path, 0o755);
  vi.stubEnv("PATH", project.bin);
  vi.stubEnv("ORK_TEST_LOG", project.log);
  vi.stubEnv("ORK_TEST_MODE", mode);
}
