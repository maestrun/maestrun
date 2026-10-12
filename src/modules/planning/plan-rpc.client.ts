import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { isRecord } from "../../contracts/workflow.js";
import { UserError } from "../../shared/errors.js";
import { answerQuestions } from "./plan-questions.js";
import type { Ui } from "../../shared/ui.types.js";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
export type PlanRpc = {
  request: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  done: Promise<string>;
  fail: (error: Error) => void;
  close: () => void;
};
type State = {
  child: ChildProcessWithoutNullStreams;
  ui: Ui;
  pending: Map<number, Pending>;
  result: Pending;
  text: string;
  bytes: number;
  streamed: Set<unknown>;
  failure?: Error;
};

function protocolError(): UserError {
  return new UserError(
    "Codex interactive planning failed.",
    "Update Codex for app-server Plan mode support, check authentication, then retry maestrun plan --interactive.",
  );
}

async function receive(state: State, value: unknown): Promise<void> {
  if (!isRecord(value)) throw protocolError();
  if (typeof value.method === "string") {
    if (value.id !== undefined) return serverRequest(state, value);
    const params = isRecord(value.params) ? value.params : {};
    displayOutput(state, value.method, params);
    if (value.method === "turn/completed") {
      if (!isRecord(params.turn) || params.turn.status !== "completed" || !state.text.trim())
        throw protocolError();
      state.result.resolve(state.text);
    }
    return;
  }
  if (typeof value.id !== "number") return;
  const request = state.pending.get(value.id);
  state.pending.delete(value.id);
  if (value.error) request?.reject(protocolError());
  else request?.resolve(value.result);
}

function displayOutput(state: State, method: string, params: Record<string, unknown>): void {
  if (
    (method === "item/agentMessage/delta" || method === "item/plan/delta") &&
    typeof params.delta === "string"
  ) {
    state.ui.write(params.delta);
    state.streamed.add(params.itemId);
  }
  if (method !== "item/completed" || !isRecord(params.item)) return;
  const item = params.item;
  if ((item.type === "agentMessage" || item.type === "plan") && typeof item.text === "string") {
    if (!state.streamed.delete(item.id)) state.ui.write(item.text);
    state.ui.write("\n\n");
    state.text = item.text;
  }
  if (item.type === "fileChange") throw protocolError();
}

async function serverRequest(state: State, message: Record<string, unknown>): Promise<void> {
  if (message.method !== "item/tool/requestUserInput" || !isRecord(message.params)) {
    state.child.stdin.write(
      `${JSON.stringify({ id: message.id, error: { code: -32601, message: "Unsupported request in read-only planning" } })}\n`,
    );
    throw protocolError();
  }
  const answers = await answerQuestions(state.ui, message.params.questions);
  state.child.stdin.write(`${JSON.stringify({ id: message.id, result: { answers } })}\n`);
}

export function connectPlan(child: ChildProcessWithoutNullStreams, ui: Ui): PlanRpc {
  const pending = new Map<number, Pending>();
  let result: Pending | undefined;
  const done = new Promise<string>((resolve, reject) => {
    result = { resolve: (value) => resolve(String(value)), reject };
  });
  if (!result) throw new Error("Missing plan completion");
  const state: State = { child, ui, pending, result, text: "", bytes: 0, streamed: new Set() };
  const fail = (error: Error): void => {
    state.failure ??= error;
    state.result.reject(error);
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  const close = listen(state, fail);
  return {
    done,
    fail,
    request: requests(state),
    close: () => {
      close();
      fail(protocolError());
    },
  };
}

function requests(state: State): PlanRpc["request"] {
  let sequence = 0;
  return (method, params) =>
    new Promise((resolve, reject) => {
      if (state.failure) return reject(state.failure);
      const id = ++sequence;
      state.pending.set(id, { resolve, reject });
      state.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
}

function listen(state: State, fail: (error: Error) => void): () => void {
  const { child } = state;
  const lines = createInterface({ input: child.stdout });
  let events = Promise.resolve();
  lines.on("line", (line) => {
    events = events
      .then(async () => {
        if (state.failure) return;
        state.bytes += Buffer.byteLength(line);
        if (state.bytes > 16 * 1024 * 1024) throw protocolError();
        await receive(state, JSON.parse(line));
      })
      .catch((error: unknown) =>
        fail(error instanceof UserError || error instanceof Error ? error : protocolError()),
      );
  });
  child.on("error", () => fail(protocolError()));
  child.on("close", () => fail(protocolError()));
  child.stdin.on("error", () => fail(protocolError()));
  child.stderr.resume();
  return () => lines.close();
}
