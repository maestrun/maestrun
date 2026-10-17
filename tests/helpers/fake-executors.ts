import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import { installCopilot } from "./copilot.js";
import type { Project } from "./project.js";

const SCRIPT = `
import { appendFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
const args = process.argv.slice(2);
const executor = basename(process.argv[1]);
const mode = process.env.ORK_TEST_MODE || 'success';
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const finish = (code, text) => { process.stdout.write(text); process.exit(code); };
const log = (input) => appendFileSync(process.env.ORK_TEST_LOG, JSON.stringify({ executor, args, input, effort: process.env.CLAUDE_CODE_EFFORT_LEVEL }) + '\\n');
function claudeCatalog(input) {
  const request = JSON.parse(input);
  if (request.type !== 'control_request' || request.request.subtype !== 'initialize') process.exit(2);
  if (mode === 'rpc-broken') finish(0, 'bad JSON\\n');
  if (mode === 'rpc-exit') process.exit(2);
  if (mode === 'claude-response-missing') { emit({ type: 'system' }); return; }
  if (mode === 'rpc-error') { emit({ type: 'control_response', response: { subtype: 'error', request_id: request.request_id } }); return; }
  let models = [
    { value: 'default', resolvedModel: 'claude-test-model', displayName: 'Default', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
    { value: 'opus', resolvedModel: 'claude-test-model', displayName: 'Test Claude', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'max'] },
    { value: 'claude-no-effort', displayName: 'No effort', supportsEffort: false },
    { value: 'opusplan', displayName: 'Automatic' },
  ];
  if (mode === 'catalog-invalid') models = [{}];
  if (mode === 'claude-id-invalid') models[0].resolvedModel = 'invalid model';
  if (mode === 'catalog-efforts-invalid') models[0].supportedEffortLevels = 'high';
  if (mode === 'catalog-effort-invalid') models[0].supportedEffortLevels = ['ultra'];
  if (mode === 'claude-efforts-missing') models = [{ value: 'claude-custom', displayName: 'Custom', supportsEffort: true }];
  if (mode === 'claude-unresolved') models = [{ value: 'opus', displayName: 'Opus' }];
  emit({ type: 'system' });
  emit({ type: 'control_response', response: { subtype: 'success', request_id: 'other', response: {} } });
  emit({ type: 'control_response', response: { subtype: 'success', request_id: request.request_id, response: { models: mode === 'claude-models-invalid' ? null : models } } });
}
if (args.includes('--version')) finish(mode === 'version-fail' ? 2 : 0, 'test executor 1.0\\n');
if (args.includes('--help')) finish(0, mode === 'old' ? 'old executor' : '--sandbox --json --ephemeral --ignore-user-config --ignore-rules --tools --restricted --safe-mode --permission-prompts --strict-mcp-config --no-session-persistence');
if (args.includes('status')) {
  if (mode === 'no-auth') finish(1, '');
  if (mode === 'auth-invalid') finish(0, 'invalid');
  if (mode === 'auth-unknown') finish(0, '{}');
  if (mode === 'auth-false') finish(0, '{"loggedIn":false}');
  finish(0, executor === 'claude' ? '{"loggedIn":true}' : 'Logged in');
}
if (args.includes('app-server')) {
  let initialized = false;
  createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    if (request.method === 'initialized') { initialized = true; return; }
    if (mode === 'rpc-broken') { process.stdout.write('bad JSON\\n'); return; }
    if (mode === 'rpc-exit') process.exit(2);
    if (mode === 'rpc-error') { emit({ id: request.id, error: { message: 'unsupported' } }); return; }
    if (request.method === 'initialize') { emit({ id: request.id, result: {} }); return; }
    if (!initialized) { emit({ id: request.id, error: {} }); return; }
    if (mode === 'catalog-invalid') { emit({ id: request.id, result: { data: [{}] } }); return; }
    if (mode === 'catalog-efforts-invalid') { emit({ id: request.id, result: { data: [{ model: 'codex-test', displayName: 'Test', supportedReasoningEfforts: 'high' }] } }); return; }
    if (mode === 'catalog-effort-invalid') { emit({ id: request.id, result: { data: [{ model: 'codex-test', displayName: 'Test', supportedReasoningEfforts: [{ reasoningEffort: 'invalid' }] }] } }); return; }
    if (mode === 'catalog-default-invalid') { emit({ id: request.id, result: { data: [{ model: 'codex-test', displayName: 'Test', supportedReasoningEfforts: [{ reasoningEffort: 'low' }], defaultReasoningEffort: 'high' }] } }); return; }
    if (mode === 'catalog-cursor-invalid') { emit({ id: request.id, result: { data: [], nextCursor: 5 } }); return; }
    if (mode === 'catalog-cycle') { emit({ id: request.id, result: { data: [], nextCursor: 'repeat' } }); return; }
    emit({ method: 'notification' });
    const second = request.params.cursor === 'page-2';
    const effort = mode === 'codex-efforts-missing' ? {} : { supportedReasoningEfforts: (second ? ['high', 'ultra'] : ['low', 'medium', 'high']).map((reasoningEffort) => ({ reasoningEffort })), ...(mode === 'codex-default-missing' ? {} : { defaultReasoningEffort: second ? 'high' : 'medium' }) };
    emit({ id: request.id, result: { data: [{ model: second ? 'codex-other' : 'codex-test', displayName: second ? 'Other model' : 'Test model', isDefault: !second, ...effort }], nextCursor: second ? null : 'page-2' } });
  });
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    if (args.includes('--input-format')) { claudeCatalog(input); return; }
    log(input);
    const model = args[args.indexOf('--model') + 1];
    if (mode === 'unsupported') { process.stderr.write('model is unsupported'); process.exit(1); }
    if (mode === 'failure') { process.stderr.write('generation failed'); process.exit(1); }
    if (mode === 'empty') { if (executor === 'codex') emit({ type: 'turn.completed' }); else emit({ subtype: 'success', is_error: false, result: '' }); return; }
    const plan = input.includes('Define a workflow for each task in the plan.')
      ? '## Tasks\\n\\n### Task research: Research the topic\\n\\n- Depends on: none\\n- Steps: custom:Research, custom:Write report\\n\\n#### Research\\nCollect evidence.\\n\\n#### Write report\\nWrite a report citing evidence.\\n\\n## Verification\\nCheck sources.'
      : '## Objective and scope\\nA small change.\\n\\n## Tasks\\n### Task command: Implement the requested command\\n- Depends on: none\\n\\nAcceptance: returns the expected result.\\n\\n## Verification\\nRun the command and tests.\\n\\n## Assumptions and unresolved questions\\nNone.';
    if (mode === 'streaming') {
      if (executor === 'claude') {
        if (!args.includes('stream-json') || !args.includes('--include-partial-messages') || !args.includes('--verbose')) process.exit(2);
        const event = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Creating the plan…' } } });
        process.stdout.write(event.slice(0, 20));
        setTimeout(() => process.stdout.write(event.slice(20) + '\\n'), 10);
      } else emit({ type: 'item.completed', item: { type: 'agent_message', text: 'Creating the plan…' } });
      const timer = setInterval(() => {
        if (!existsSync('.stream-continue')) return;
        clearInterval(timer);
        if (executor === 'claude') {
          emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: plan } } });
          emit({ type: 'result', subtype: 'success', is_error: false, result: plan, modelUsage: { [model]: {} } });
        } else {
          emit({ type: 'item.completed', item: { type: 'agent_message', text: plan } });
          emit({ type: 'turn.completed' });
        }
      }, 10);
      return;
    }
    if (executor === 'claude') emit({ type: 'result', subtype: 'success', is_error: false, result: plan, modelUsage: { [model]: {} } });
    else { emit({ type: 'item.completed', item: { type: 'agent_message', text: plan } }); emit({ type: 'turn.completed' }); }
  });
}
`;

export async function installExecutors(project: Project, mode = "success"): Promise<void> {
  await installCopilot(project, mode);
  for (const executable of ["codex", "claude"]) {
    const path = join(project.bin, executable);
    await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
    await chmod(path, 0o755);
  }
  vi.stubEnv("PATH", project.bin);
  vi.stubEnv("ORK_TEST_LOG", project.log);
  vi.stubEnv("ORK_TEST_MODE", mode);
}
