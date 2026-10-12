import { isStage } from "../../src/contracts/workflow.js";
import type { StageId } from "../../src/contracts/workflow.js";
import { ADD_CUSTOM_STEP, CREATE_STEP_FILES } from "../../src/shared/ui.types.js";
import type { Choice, StageChoice, Ui } from "../../src/shared/ui.types.js";

type Response = string | boolean | readonly string[] | Error;
type Call = Readonly<{
  kind: string;
  message: string;
  initial: unknown;
  choices?: readonly Choice[];
  order?: readonly StageId[];
}>;
type Script = { responses: Response[]; calls: Call[]; messages: string[] };

function take(script: Script, call: Call): Response {
  script.calls.push(call);
  const response = script.responses.shift();
  if (response instanceof Error) throw response;
  if (response === undefined) throw new Error(`No scripted answer for ${call.message}`);
  return response;
}

function textAnswer(script: Script, call: Call): string {
  const response = take(script, call);
  if (typeof response !== "string") throw new Error(`Expected text for ${call.message}`);
  return response;
}

function booleanAnswer(script: Script, call: Call): boolean {
  const response = take(script, call);
  if (typeof response !== "boolean") throw new Error(`Expected confirmation for ${call.message}`);
  return response;
}

function stageAnswer(
  script: Script,
  initial: readonly StageId[],
  order?: readonly StageId[],
): readonly StageChoice[] {
  const response = take(script, {
    kind: "stages",
    message: "stages",
    initial,
    ...(order ? { order } : {}),
  });
  if (
    !Array.isArray(response) ||
    !response.every((id) => isStage(id) || id === ADD_CUSTOM_STEP || id === CREATE_STEP_FILES)
  )
    throw new Error("Expected stages");
  return response.filter(
    (id): id is StageChoice => isStage(id) || id === ADD_CUSTOM_STEP || id === CREATE_STEP_FILES,
  );
}

function fileAnswer(script: Script, call: Call): readonly string[] {
  const response = take(script, call);
  if (!Array.isArray(response) || !response.every((value) => typeof value === "string"))
    throw new Error("Expected file selections");
  return response.filter((value): value is string => typeof value === "string");
}

function createUi(script: Script): Ui {
  return {
    select: (message, choices, initial) =>
      Promise.resolve(textAnswer(script, { kind: "select", message, initial, choices })),
    search: (message, choices, initial) =>
      Promise.resolve(textAnswer(script, { kind: "search", message, initial, choices })),
    checkbox: (message, choices, initial) =>
      Promise.resolve(fileAnswer(script, { kind: "checkbox", message, initial, choices })),
    stages: (initial, order) => Promise.resolve(stageAnswer(script, initial, order)),
    orderStep: (ids, step) => {
      const response = take(script, { kind: "orderStep", message: `Order ${step}`, initial: ids });
      if (!Array.isArray(response) || !response.every(isStage))
        throw new Error("Expected step order");
      return Promise.resolve(response.filter(isStage));
    },
    input: (message, initial) =>
      Promise.resolve(textAnswer(script, { kind: "input", message, initial })),
    confirm: (message, initial) =>
      Promise.resolve(booleanAnswer(script, { kind: "confirm", message, initial })),
    paste: (initial) =>
      Promise.resolve(textAnswer(script, { kind: "paste", message: "paste", initial })),
    log: (message) => {
      script.messages.push(message);
    },
    write: (text) => {
      script.messages.push(text);
    },
    progress: async (_message, task) => task(),
  };
}

export function scriptedUi(responses: readonly Response[]): Readonly<{
  ui: Ui;
  calls: readonly Call[];
  messages: readonly string[];
  remaining: () => number;
}> {
  const script: Script = { responses: [...responses], calls: [], messages: [] };
  return {
    ui: createUi(script),
    calls: script.calls,
    messages: script.messages,
    remaining: () => script.responses.length,
  };
}
