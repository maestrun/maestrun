import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";
import type { Project } from "./project.js";
import { TASK_SESSION_SCRIPT } from "./task-session-script.js";

const SCRIPT = `
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.ORK_RUN_MODE;
const log = (value) => fs.appendFileSync(process.env.ORK_TEST_LOG, JSON.stringify(value) + '\\n');
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const plan = '# Plan\\nAcceptance criteria and verification.';
${TASK_SESSION_SCRIPT}
if (args.includes('--version')) { process.stdout.write('test executor 1.0'); process.exit(0); }
if (args.includes('--help')) { process.stdout.write('--sandbox --json --ephemeral --ignore-user-config --ignore-rules --tools --restricted --safe-mode --permission-prompts --strict-mcp-config --no-session-persistence'); process.exit(0); }
if (args.includes('status')) { process.stdout.write('{"loggedIn":true}'); process.exit(0); }
if (args.includes('--input-format')) { claudeExecution(); }
else if (args.includes('app-server')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const message = JSON.parse(line);
    if (message.method === 'thread/start') executing = message.params.sandbox === 'workspace-write';
    if (executing) { codexExecution(message); return; }
    if (message.method === 'model/list') {
      emit({ id: message.id, result: { data: ['code-test', 'sample-model'].map((model) => ({ model, displayName: model, isDefault: model === 'code-test', supportedReasoningEfforts: ['low', 'high'].map((reasoningEffort) => ({ reasoningEffort })) })), nextCursor: null } });
      return;
    }
    if (message.method !== 'initialize' && message.method !== 'initialized') log(message);
    if (mode === 'hang') return;
    if (mode === 'bad-rpc') { process.stdout.write('not json\\n'); return; }
    if (message.method === 'initialize') emit({ id: message.id, result: {} });
    if (message.method === 'thread/start') emit({ id: message.id, result: { thread: { id: 'thread-1' } } });
    if (message.method === 'turn/start') {
      emit({ id: message.id, result: { turn: { id: 'turn-1' } } });
      if (mode === 'rpc-error') { emit({ method: 'turn/completed', params: { turn: { status: 'failed' } } }); return; }
      if (mode === 'approval') { emit({ id: 80, method: 'item/commandExecution/requestApproval', params: {} }); return; }
      if (mode === 'streaming') {
        emit({ method: 'item/agentMessage/delta', params: { itemId: 'message-1', delta: 'Choosing scope.' } });
        emit({ method: 'item/completed', params: { item: { id: 'message-1', type: 'agentMessage', text: 'Choosing scope.' } } });
      }
      emit({ id: 90, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'scope', question: 'Which scope?', options: [{ label: 'Small', description: 'One task' }] }] } });
    }
    if (message.id === 90) {
      if (mode === 'streaming') {
        emit({ method: 'item/plan/delta', params: { itemId: 'plan-1', delta: '# Plan' } });
        const timer = setInterval(() => {
          if (!fs.existsSync('.stream-continue')) return;
          clearInterval(timer);
          emit({ method: 'item/plan/delta', params: { itemId: 'plan-1', delta: '\\nAcceptance criteria and verification.' } });
          emit({ method: 'item/completed', params: { item: { id: 'plan-1', type: 'plan', text: plan } } });
          emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
        }, 10);
        return;
      }
      emit({ method: 'item/completed', params: { item: { type: mode === 'file-change' ? 'fileChange' : 'plan', text: plan } } });
      emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
    }
  });
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    log({ args, input, parentSession: process.env.CLAUDECODE ?? null });
    if (mode === 'exit') { process.stderr.write('generation failed'); process.exit(1); }
    if (mode === 'hang') { setInterval(() => {}, 1000); return; }
    let result = JSON.stringify({ status: 'completed', summary: 'Tests and acceptance criteria passed' });
    if (mode === 'failed') result = JSON.stringify({ status: 'failed', summary: 'A test failed' });
    if (mode === 'malformed') result = 'not json';
    if (mode === 'questions') result = input.includes('User answers:') ? JSON.stringify({ plan }) : JSON.stringify({ questions: [{ id: 'scope', question: 'Which scope?' }] });
    const model = args[args.indexOf('--model') + 1];
    const finish = () => {
    if (args.includes('exec')) {
      emit({ type: 'item.completed', item: { type: 'file_change' } });
      emit({ type: 'item.completed', item: { type: 'agent_message', text: result } });
      emit({ type: 'turn.completed' });
    } else emit({ type: 'result', subtype: 'success', is_error: false, result, modelUsage: { [model]: {} } });
    };
    if (mode === 'gate') {
      const timer = setInterval(() => {
        if (!fs.existsSync('.finish-execution')) return;
        clearInterval(timer); finish();
      }, 20);
    } else finish();
  });
}
`;

export async function executionProcesses(project: Project, mode = "success"): Promise<void> {
  for (const name of ["codex", "claude"]) {
    const path = join(project.bin, name);
    await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
    await chmod(path, 0o755);
  }
  vi.stubEnv("PATH", project.bin);
  vi.stubEnv("ORK_RUN_MODE", mode);
  vi.stubEnv("ORK_TEST_LOG", project.log);
}
