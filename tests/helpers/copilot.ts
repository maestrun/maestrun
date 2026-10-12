import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import type { Project } from "./project.js";

const SCRIPT = `
const { appendFileSync, existsSync } = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.ORK_TEST_MODE;
const emit = (value) => console.log(JSON.stringify(value));
if (args.includes('--version')) { console.log('Copilot test'); process.exit(0); }
if (args.includes('--help')) {
  console.log(mode === 'old' ? 'old' : '--available-tools --deny-tool --output-format --no-ask-user --session-id --reasoning-effort --no-remote-export');
  process.exit(0);
}
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (!args.includes('--headless') || !input.includes('\\r\\n\\r\\n')) return;
  const request = JSON.parse(input.split('\\r\\n\\r\\n')[1]);
  let result = { isAuthenticated: mode !== 'no-auth' };
  if (mode === 'auth-invalid') result = {};
  if (request.method === 'models.list') result = { models: [
    { id: 'copilot-test', name: 'Test Copilot', supportedReasoningEfforts: ['low','high'], defaultReasoningEffort: 'high' },
    { id: 'copilot-simple', name: 'Simple' },
    { id: 'auto', name: 'Automatic' },
    { id: 'disabled', name: 'Disabled', policy: { state: 'disabled' } }
  ] };
  if (mode === 'catalog-invalid') result = { models: [{}] };
  if (mode === 'catalog-effort-invalid') result.models[0].supportedReasoningEfforts = ['ultra'];
  if (mode === 'catalog-default-invalid') result.models[0].defaultReasoningEffort = 'medium';
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result });
  let frame = 'Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body;
  if (mode === 'rpc-invalid') frame = 'Bad-Header: x\\r\\n\\r\\n{}';
  if (mode === 'rpc-exit') process.exit(1);
  if (mode === 'hang') return;
  process.stdout.write(frame.slice(0, 25));
  setTimeout(() => process.stdout.write(frame.slice(25)), 5);
});
process.stdin.on('end', () => {
  if (args.includes('--headless')) return;
  appendFileSync(process.env.ORK_TEST_LOG, JSON.stringify({ args, input }) + '\\n');
  if (mode === 'hang') { setInterval(() => {}, 1000); return; }
  if (mode === 'failure') { console.error('401 unauthorized'); process.exit(1); }
  if (mode === 'malformed') { console.log('invalid JSONL'); return; }
  const model = args[args.indexOf('--model') + 1];
  const message = (content) => emit({ type: 'assistant.message', data: { content, model } });
  const finish = () => {
    let text = '## Plan\\nAcceptance criteria: implement the requested change.';
    if (input.includes('For this interactive exchange')) text = JSON.stringify(input.includes('User answers:')
      ? { plan: text } : { questions: [{ id: 'scope', question: 'Scope?' }] });
    else if (args.includes('--allow-tool=write,shell')) text = JSON.stringify({ status: mode === 'refactor' ? 'refactor' : 'completed', summary: input.includes('Run only the') ? 'Checks passed' : input });
    message(mode === 'empty' ? '' : text);
    if (mode !== 'incomplete') emit({ type: 'result', exitCode: mode === 'result-failure' ? 1 : 0 });
  };
  if (mode === 'conversation') {
    message('Working on the task');
    const timer = setInterval(() => {
      if (!existsSync('.finish-execution')) return;
      clearInterval(timer); finish();
    }, 10);
  } else finish();
});
`;

export async function installCopilot(project: Project, mode = "success"): Promise<void> {
  const path = join(project.bin, "copilot");
  await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
  await chmod(path, 0o755);
  vi.stubEnv("PATH", project.bin);
  vi.stubEnv("ORK_TEST_LOG", project.log);
  vi.stubEnv("ORK_TEST_MODE", mode);
}
