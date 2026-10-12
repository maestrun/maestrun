import { checkbox, confirm, editor, input, search, select } from "@inquirer/prompts";
import { afterEach, expect, test, vi } from "vitest";
import { isRecord } from "../contracts/workflow.js";
import { terminalUi } from "./terminal.js";
import { CancelError } from "./errors.js";
import { ADD_CUSTOM_STEP } from "./ui.types.js";
import { orderStepPrompt } from "./order-step.js";
import { stagesPrompt } from "./stages-prompt.js";

vi.mock("@inquirer/prompts");
vi.mock("./order-step.js");
vi.mock("./stages-prompt.js");
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

test("uses native select prompts with saved defaults and cancellation", async () => {
  vi.mocked(select).mockResolvedValueOnce("model");
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.select("Executor", [{ name: "Model", value: "model" }], "model")).toBe("model");
  const config = vi.mocked(select).mock.calls[0]?.[0];
  expect(config?.default).toBe("model");
  const cancel = config?.choices.find((choice) => isRecord(choice) && choice.name === "Cancel");
  if (!isRecord(cancel) || typeof cancel.value !== "symbol") throw new Error("Missing Cancel");
  vi.mocked(select).mockResolvedValueOnce(cancel.value);
  await expect(ui.select("Executor", [])).rejects.toThrow(CancelError);
});

test("native model search filters results while keeping manual entry", async () => {
  vi.mocked(search).mockResolvedValueOnce("second");
  const ui = terminalUi(new AbortController().signal);
  await ui.search(
    "Models",
    [
      { name: "First", value: "first" },
      { name: "Second", value: "second" },
      { name: "Manual", value: "" },
    ],
    "second",
  );
  const config = vi.mocked(search).mock.calls[0]?.[0];
  if (!config) throw new Error("Missing search configuration");
  const options = { signal: new AbortController().signal };
  expect(await config.source("second", options)).toEqual(
    expect.arrayContaining([
      { name: "Second", value: "second" },
      { name: "Manual", value: "" },
    ]),
  );
  expect(await config.source("second", options)).not.toContainEqual({
    name: "First",
    value: "first",
  });
  expect((await config.source(undefined, options))[0]).toEqual({ name: "Second", value: "second" });
});

test("stages use the action-aware prompt with saved selections", async () => {
  vi.mocked(stagesPrompt).mockResolvedValueOnce(["planning", "testing"]);
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.stages(["testing"])).toEqual(["planning", "testing"]);
  expect(vi.mocked(stagesPrompt).mock.calls[0]?.[0]).toEqual({ selected: ["testing"] });
  expect(vi.mocked(stagesPrompt).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
});

test("guidance checkboxes retain existing selections and allow an empty selection", async () => {
  vi.mocked(checkbox).mockResolvedValueOnce(["skill.md"]);
  const ui = terminalUi(new AbortController().signal);
  expect(
    await ui.checkbox("Skills", [{ name: "Verify", value: "skill.md" }], ["skill.md"]),
  ).toEqual(["skill.md"]);
  expect(vi.mocked(checkbox).mock.calls[0]?.[0].choices).toEqual([
    { name: "Verify", value: "skill.md", checked: true },
  ]);
  expect(vi.mocked(checkbox).mock.calls[0]?.[0].required).toBe(false);
});

test("stage selection preserves custom steps when adding another step", async () => {
  const selected = ["planning", "testing", "custom:Audit", "review"] as const;
  vi.mocked(stagesPrompt).mockResolvedValueOnce([...selected, ADD_CUSTOM_STEP]);
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.stages(selected)).toEqual([...selected, ADD_CUSTOM_STEP]);
  expect(vi.mocked(stagesPrompt).mock.calls[0]?.[0]).toEqual({ selected });
});

test("stage selection receives the full order separately from checked steps", async () => {
  const selected = ["planning"] as const;
  const order = ["planning", "implementation", "custom:Audit", "testing", "review"] as const;
  vi.mocked(stagesPrompt).mockResolvedValueOnce(["planning", "custom:Audit"]);
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.stages(selected, order)).toEqual(["planning", "custom:Audit"]);
  expect(vi.mocked(stagesPrompt).mock.calls[0]?.[0]).toEqual({ selected, order });
});

test("ordering uses the full step list and an abortable prompt", async () => {
  const ids = ["planning", "review", "custom:Audit"] as const;
  vi.mocked(orderStepPrompt).mockResolvedValueOnce(["planning", "custom:Audit", "review"]);
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.orderStep(ids, "custom:Audit")).toEqual(["planning", "custom:Audit", "review"]);
  expect(vi.mocked(orderStepPrompt).mock.calls[0]?.[0]).toEqual({ ids, step: "custom:Audit" });
  expect(vi.mocked(orderStepPrompt).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
});

test("uses editable input defaults, safe confirmation defaults and the existing editor", async () => {
  vi.mocked(input).mockResolvedValueOnce("requirements.md");
  vi.mocked(confirm).mockResolvedValueOnce(false);
  vi.mocked(editor).mockResolvedValueOnce("multiline\nrequirements");
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.input("File path", "requirements.md")).toBe("requirements.md");
  expect(await ui.confirm("Generate?")).toBe(false);
  expect(await ui.paste()).toBe("multiline\nrequirements");
  expect(vi.mocked(input).mock.calls[0]?.[0].prefill).toBe("editable");
  expect(vi.mocked(confirm).mock.calls[0]?.[0].default).toBe(false);
});

test("progress preserves the result and errors, and statuses include readable text", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const ui = terminalUi(new AbortController().signal);
  expect(await ui.progress("Generating", async () => "Plan")).toBe("Plan");
  await expect(
    ui.progress("Generating", async () => {
      throw new Error("Failure");
    }),
  ).rejects.toThrow("Failure");
  ui.log("Plan saved");
  expect(log).toHaveBeenCalledWith(expect.stringContaining("Plan saved"));
  ui.write("Partial output");
  expect(write).toHaveBeenCalledWith("Partial output");
});
