import { isRecord } from "../../contracts/workflow.js";
import { BackError, CancelError, UserError } from "../../shared/errors.js";
import type { Ui } from "../../shared/ui.types.js";

export async function answerQuestions(
  ui: Ui,
  value: unknown,
): Promise<Record<string, { answers: string[] }>> {
  if (!Array.isArray(value) || !value.length)
    throw new UserError("Invalid planning questions.", "Update the executor and retry planning.");
  const answers: Record<string, { answers: string[] }> = Object.create(null);
  for (const question of value) {
    if (
      !isRecord(question) ||
      typeof question.id !== "string" ||
      typeof question.question !== "string"
    )
      throw new UserError("Invalid planning question.", "Update the executor and retry planning.");
    try {
      answers[question.id] = { answers: [await answerQuestion(ui, question)] };
    } catch (error) {
      if (error instanceof BackError) throw new CancelError();
      throw error;
    }
  }
  return answers;
}

async function answerQuestion(ui: Ui, question: Record<string, unknown>): Promise<string> {
  const text = String(question.question);
  const options = Array.isArray(question.options) ? question.options : [];
  const choices = options
    .filter(isRecord)
    .filter((option) => typeof option.label === "string")
    .map((option, index) => ({
      name: `${option.label}${typeof option.description === "string" ? ` — ${option.description}` : ""}`,
      value: String(index),
    }));
  if (choices.length) {
    const chosen = await ui.select(text, [
      ...choices,
      { name: "Write an answer", value: "custom" },
    ]);
    if (chosen !== "custom") {
      const option: unknown = options[Number(chosen)];
      if (isRecord(option) && typeof option.label === "string") return option.label;
    }
  }
  let answer = "";
  while (!answer.trim()) answer = await ui.input(text);
  return answer.trim();
}
