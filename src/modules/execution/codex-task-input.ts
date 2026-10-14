import { AuthenticationRequiredError, executorFailure, UserError } from "../../shared/errors.js";
import type { ModelProcess } from "./task-model-process.js";
import type { TaskChannel } from "./task-conversation.js";
import { isRecord } from "../../contracts/workflow.js";
import { validInputText } from "./task-input.js";

export function codexInputRequest(
  value: Record<string, unknown>,
  context: string,
): string | undefined {
  if (value.method !== "item/tool/requestUserInput") return undefined;
  const questions: unknown = isRecord(value.params) ? value.params.questions : undefined;
  if (!Array.isArray(questions) || !questions.length) throw new Error("Invalid task questions");
  const question = questions.map(questionText).join("\n\n");
  if (!validInputText(question)) throw new Error("Invalid task questions");
  return JSON.stringify({
    status: "needs_input",
    question,
    summary: context.slice(0, 32000) || "The model needs your decision to continue this step.",
  });
}

function questionText(value: unknown): string {
  if (!isRecord(value) || !validInputText(value.question)) throw new Error("Invalid task question");
  const options = Array.isArray(value.options) ? value.options : [];
  return [
    value.question,
    ...options.map((option: unknown) => {
      if (!isRecord(option) || !validInputText(option.label))
        throw new Error("Invalid question option");
      return `- ${option.label}${validInputText(option.description) ? `: ${option.description}` : ""}`;
    }),
  ].join("\n");
}

export function respondToTaskRequest(
  value: Record<string, unknown>,
  state: { model: ModelProcess; channel: TaskChannel; text: string },
): void {
  const question = codexInputRequest(value, state.text);
  if (!question) {
    state.model.send({
      id: value.id,
      error: { code: -32601, message: "Unsupported task request" },
    });
    return;
  }
  state.channel.output(`${question}\n`);
  void state.channel
    .flush()
    .then(() => state.model.resolve(question))
    .catch(state.model.fail);
}

export function codexTaskFailure(details?: unknown): UserError {
  const error = executorFailure("Codex", JSON.stringify(details) ?? "");
  return error instanceof AuthenticationRequiredError
    ? error
    : new UserError(
        "Codex task conversation failed.",
        "Update Codex and inspect the task before retrying.",
      );
}
