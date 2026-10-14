export const TASK_SESSION_SCRIPT = `
let executing = false;
let extraInstructions = '';
let taskPrompt = '';
const resultText = () => (mode === 'needs-input' || mode === 'native-input') && !taskPrompt.includes('Earlier questions and user answers:')
? JSON.stringify({ status: 'needs_input', question: 'Which region should this task use?', summary: 'Files inspected; a region is required.' })
: mode === 'sample' && taskPrompt.startsWith('Run only the Implementation stage for task sample-confirmation:') && !taskPrompt.includes('Earlier questions and user answers:')
? JSON.stringify({ status: 'on_hold', question: 'Simulated approval: type continue to resume this task.', summary: 'Waiting for your simulated PR approval. No real PR or login is required.' })
: mode === 'sample' && taskPrompt.startsWith('Run only the Implementation stage for task sample-missing-input:')
? JSON.stringify({ status: 'failed', summary: 'ENOENT: sample-required-input.json is missing' })
: mode === 'sample' && taskPrompt.startsWith('Run only the QA stage for task sample-clamp:') && !taskPrompt.includes('\\nPrevious failure:')
? JSON.stringify({ status: 'refactor', summary: 'clamp.mjs omits the required upper bound' })
: mode === 'malformed' ? 'not json' : JSON.stringify({
  status: mode === 'failed' ? 'failed' : mode === 'refactor' ? 'refactor' : 'completed',
  summary: mode === 'failed' ? 'A test failed' : mode === 'refactor' ? 'Update the validation checks' : 'Tests and acceptance criteria passed' + extraInstructions,
});
function whenReady(finish) {
  if (mode === 'hang') return;
  if (mode === 'sample') { setTimeout(finish, 200); return; }
  if (mode === 'gate' || mode === 'conversation') {
    const timer = setInterval(() => {
      if (!fs.existsSync('.finish-execution')) return;
      clearInterval(timer); finish();
    }, 20);
  } else finish();
}
function codexExecution(message) {
  if (message.method === 'thread/start') {
    emit({ id: message.id, result: { thread: { id: 'task-thread' } } }); return;
  }
  if (message.method === 'turn/steer') {
    log({ type: 'steer', params: message.params });
    extraInstructions += ' ' + message.params.input[0].text;
    emit({ id: message.id, result: { turnId: 'task-turn' } });
    emit({ method: 'item/agentMessage/delta', params: { itemId: 'ack', delta: 'Applying your instructions.' } });
    emit({ method: 'item/completed', params: { item: { id: 'ack', type: 'agentMessage', text: 'Applying your instructions.' } } });
    return;
  }
  if (message.method !== 'turn/start') return;
  taskPrompt = message.params.input[0].text;
  log({ args, input: message.params.input[0].text, params: message.params });
  if (mode === 'exit') process.exit(1);
  if (mode === 'login') { process.stderr.write('401 unauthorized: login required'); process.exit(1); }
  emit({ id: message.id, result: { turn: { id: 'task-turn' } } });
  emit({ method: 'item/agentMessage/delta', params: { itemId: 'working', delta: 'Working on the task.' } });
  emit({ method: 'item/completed', params: { item: { id: 'working', type: 'agentMessage', text: 'Working on the task.' } } });
  if (mode === 'native-input' && !taskPrompt.includes('Earlier questions and user answers:')) {
    emit({ id: 90, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'region', question: 'Which region?', options: [{ label: 'Brazil', description: 'South America' }] }] } }); return;
  }
  whenReady(() => {
    for (let i = 0; i < 2; i++) emit({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { inputTokens: 1000, outputTokens: 100 } } } });
    emit({ method: 'item/completed', params: { item: { type: 'agentMessage', id: 'final', text: resultText() } } });
    emit({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
  });
}
function claudeExecution() {
  let turn = 0;
  require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
    const message = JSON.parse(line);
    if (message.type !== 'user') process.exit(2);
    taskPrompt = message.message.content;
    log({ args, input: message.message.content, parentSession: process.env.CLAUDECODE ?? null });
    if (++turn > 1) extraInstructions += ' ' + message.message.content;
    if (mode === 'exit') process.exit(1);
  if (mode === 'login') { process.stderr.write('401 unauthorized: login required'); process.exit(1); }
    emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Working on the task.' } } });
    whenReady(() => emit({ type: 'result', subtype: 'success', is_error: false, result: resultText(), modelUsage: { [args[args.indexOf('--model') + 1]]: { inputTokens: 500 * turn, outputTokens: 50 * turn, cacheReadInputTokens: 100 * turn, cacheCreationInputTokens: 100 * turn } } }));
  });
}
`;
