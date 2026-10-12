import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { BackError } from "../../src/shared/errors.js";
import { selectRequirements } from "../../src/modules/planning/index.js";
import { wizardContext } from "../helpers/context.js";
import { test } from "../helpers/project.js";
import { scriptedUi } from "../helpers/ui.js";

test("browses folders, rejects invalid text, and returns the selected requirements", async ({
  project,
}) => {
  const docs = join(project.cwd, "docs");
  await mkdir(docs);
  await writeFile(join(docs, "binary"), Buffer.from([0xff]));
  await writeFile(join(docs, "work.md"), "Selected work");
  const script = scriptedUi(["file", docs, join(docs, "binary"), join(docs, "work.md")]);
  expect((await selectRequirements(wizardContext(project.cwd, script.ui))).text).toBe(
    "Selected work",
  );
  expect(script.messages.join("\n")).toContain("UTF-8");
});

test("browse Back returns to the requirements source selector", async ({ project }) => {
  const script = scriptedUi(["file", new BackError(), "path", "missing.md", "requirements.md"]);
  const requirements = await selectRequirements(wizardContext(project.cwd, script.ui));
  expect(requirements.source).toBe(join(project.cwd, "requirements.md"));
  expect(script.calls.filter((call) => call.kind === "input")[1]?.initial).toBe("missing.md");
});

test("parent directory navigation can select requirements outside the project", async ({
  project,
}) => {
  await writeFile(join(project.root, "external.md"), "External work");
  const script = scriptedUi(["file", project.root, join(project.root, "external.md")]);
  expect((await selectRequirements(wizardContext(project.cwd, script.ui))).text).toBe(
    "External work",
  );
});

test("empty pasted text is editable again and previous file paths are prefilled", async ({
  project,
}) => {
  const pasted = scriptedUi(["paste", "  ", "New work"]);
  expect((await selectRequirements(wizardContext(project.cwd, pasted.ui))).text).toBe("New work");
  expect(pasted.calls.filter((call) => call.kind === "paste")[1]?.initial).toBe("  ");
  const path = scriptedUi(["path", "requirements.md"]);
  await selectRequirements(wizardContext(project.cwd, path.ui), {
    text: "Previous work",
    source: "requirements.md",
  });
  expect(path.calls[1]?.initial).toBe("requirements.md");
});
