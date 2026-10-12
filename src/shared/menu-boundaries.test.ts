import { select, checkbox } from "@inquirer/prompts";
import { expect, test, vi } from "vitest";
import { terminalUi } from "./terminal.js";
import { stagesPrompt } from "./stages-prompt.js";
import { promptHarness } from "../../tests/helpers/prompts.js";

vi.mock("@inquirer/prompts");

test("select and checkbox menus explicitly disable wraparound", async () => {
  vi.mocked(select).mockResolvedValue("a");
  vi.mocked(checkbox).mockResolvedValue([]);
  const ui = terminalUi(new AbortController().signal);
  await ui.select("Choose", [{ name: "A", value: "a" }]);
  await ui.checkbox("Files", []);
  expect(vi.mocked(select).mock.calls[0]?.[0].loop).toBe(false);
  expect(vi.mocked(checkbox).mock.calls[0]?.[0].loop).toBe(false);
});

test("Up on the first stage stays there and Down at the end stays on Continue", async () => {
  const terminal = promptHarness();
  const first = stagesPrompt({ selected: ["planning"] }, terminal.context);
  await terminal.send(["\u001b[A", " ", "\r"]);
  expect(await first).toEqual(["planning"]);
  const last = stagesPrompt({ selected: ["planning"] }, terminal.context);
  await terminal.send([...Array<string>(10).fill("\u001b[B"), " ", "\r"]);
  expect(await last).toEqual(["planning"]);
});
