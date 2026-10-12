import type { StepInput } from "../../contracts/run.js";
import { isRecord } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { CODEX_RESTRICTIONS } from "../executors/index.js";
import { taskModelProcess } from "./task-model-process.js";
import { CODEX_NETWORK_ARGUMENTS } from "./step-protocol.js";
import type { ModelProcess } from "./task-model-process.js";
import type { TaskChannel } from "./task-conversation.js";
import { tokenUsageCollector } from "../../shared/token-usage.js";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type State = {
  model: ModelProcess;
  channel: TaskChannel;
  pending: Map<number, Pending>;
  thread: string;
  turn: string;
  text: string;
  streamed: Set<unknown>;
};
const failure = (): UserError =>
  new UserError(
    "Codex task conversation failed.",
    "Update Codex and inspect the task before retrying.",
  );

export async function codexTaskSession(
  input: StepInput,
  prompt: string,
  channel: TaskChannel,
): Promise<string> {
  const model = taskModelProcess(
    {
      ...input,
      executable: "codex",
      args: [...CODEX_RESTRICTIONS, ...CODEX_NETWORK_ARGUMENTS, "app-server"],
    },
    (value) => receive(state, value),
    tokenUsageCollector("codex", input.onUsage).event,
  );
  const state: State = {
    model,
    channel,
    pending: new Map(),
    thread: "",
    turn: "",
    text: "",
    streamed: new Set(),
  };
  try {
    return (await Promise.all([start(state, input, prompt), model.done]))[1];
  } finally {
    for (const entry of state.pending.values()) entry.reject(failure());
    await model.close();
  }
}

function request(state: State, method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = sequence++;
  return new Promise((resolve, reject) => {
    state.pending.set(id, { resolve, reject });
    state.model.send({ id, method, params });
  });
}
let sequence = 1;

async function start(state: State, input: StepInput, prompt: string): Promise<void> {
  await request(state, "initialize", { clientInfo: { name: "maestrun", version: "0.1.0" } });
  state.model.send({ method: "initialized" });
  const thread = await request(state, "thread/start", {
    model: input.stage.model,
    cwd: input.cwd,
    approvalPolicy: "never",
    sandbox: "workspace-write",
    ephemeral: true,
  });
  if (!isRecord(thread) || !isRecord(thread.thread) || typeof thread.thread.id !== "string")
    throw failure();
  state.thread = thread.thread.id;
  const turn = await request(state, "turn/start", {
    threadId: state.thread,
    input: [{ type: "text", text: prompt, text_elements: [] }],
    model: input.stage.model,
    effort: input.stage.effort ?? null,
  });
  if (!isRecord(turn) || !isRecord(turn.turn) || typeof turn.turn.id !== "string") throw failure();
  state.turn = turn.turn.id;
  listenForInstructions(state);
}

function receive(state: State, value: Record<string, unknown>): void {
  if (value.id !== undefined && typeof value.method === "string") {
    state.model.send({
      id: value.id,
      error: { code: -32601, message: "Unsupported task request" },
    });
    return;
  }
  if (typeof value.id === "number") {
    const pending = state.pending.get(value.id);
    state.pending.delete(value.id);
    if (value.error) pending?.reject(failure());
    else pending?.resolve(value.result);
    return;
  }
  const params = isRecord(value.params) ? value.params : {};
  output(state, value.method, params);
  if (value.method !== "turn/completed") return;
  state.turn = "";
  if (!isRecord(params.turn) || params.turn.status !== "completed") {
    state.model.fail(failure());
    return;
  }
  void state.channel
    .flush()
    .then(() => state.model.resolve(state.text))
    .catch(state.model.fail);
}

function output(state: State, method: unknown, params: Record<string, unknown>): void {
  if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
    state.channel.output(params.delta);
    state.streamed.add(params.itemId);
  }
  if (method !== "item/completed" || !isRecord(params.item)) return;
  const item = params.item;
  if (item.type !== "agentMessage" || typeof item.text !== "string") return;
  state.text = item.text;
  if (!state.streamed.delete(item.id)) state.channel.output(item.text);
  state.channel.output("\n\n");
}

function listenForInstructions(state: State): void {
  state.channel.listen(async (message) => {
    if (!state.turn) throw failure();
    await request(state, "turn/steer", {
      threadId: state.thread,
      expectedTurnId: state.turn,
      input: [{ type: "text", text: message.text, text_elements: [] }],
    });
    return "sent";
  });
}
