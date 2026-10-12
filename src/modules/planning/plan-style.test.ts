import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "../../../tests/helpers/project.js";
import { CONFIG, wizardContext } from "../../../tests/helpers/context.js";
import { scriptedUi } from "../../../tests/helpers/ui.js";
import { BackError } from "../../shared/errors.js";
import { discoverPlanningFiles } from "./planning-files.js";
import { selectPlanRequirements } from "./plan-style.js";
import { runPlanWizard } from "./plan-wizard.js";

test("discovers nested planning documents and skips dependencies, hidden paths and symlinks", async ({
  project,
}) => {
  for (const directory of ["docs/checkout", "specs", "node_modules/pkg", "dist", ".private"])
    await mkdir(join(project.cwd, directory), { recursive: true });
  for (const path of [
    "docs/checkout/PRD.md",
    "specs/custom.md",
    "node_modules/pkg/plan.md",
    "dist/tasks.md",
    ".private/requirements.md",
  ])
    await writeFile(join(project.cwd, path), "Work");
  await symlink(project.cwd, join(project.cwd, "linked"));
  await symlink(join(project.cwd, "requirements.md"), join(project.cwd, "plan.md"));
  expect(await discoverPlanningFiles(project.cwd)).toEqual([
    "docs/checkout/PRD.md",
    "requirements.md",
    "specs/custom.md",
  ]);
});

test("offers discovered files first and reuses the selected document without a style question", async ({
  project,
}) => {
  const script = scriptedUi(["requirements.md"]);
  const result = await selectPlanRequirements(wizardContext(project.cwd, script.ui));
  expect(result.planMode).toBe("existing");
  expect(result.requirements.text).toContain("Add a small command");
  expect(script.calls[0]?.initial).toBe("requirements.md");
  expect(script.calls).toHaveLength(1);
});

test("accepts a custom requirements filename without asking for a new plan style", async ({
  project,
}) => {
  await rm(join(project.cwd, "requirements.md"));
  await writeFile(join(project.cwd, "my-idea.md"), "My existing work");
  const script = scriptedUi(["path", "my-idea.md"]);
  const result = await selectPlanRequirements(wizardContext(project.cwd, script.ui));
  expect(result.planMode).toBe("existing");
  expect(result.requirements.text).toBe("My existing work");
  expect(script.remaining()).toBe(0);
});

test.for(["simple", "advanced"] as const)(
  "offers %s when no planning files exist",
  async (style, { project }) => {
    await rm(join(project.cwd, "requirements.md"));
    const script = scriptedUi([
      "paste",
      "Build checkout",
      style,
      ...(style === "advanced" ? [""] : []),
      true,
    ]);
    const draft = await runPlanWizard({
      ...wizardContext(project.cwd, script.ui),
      config: CONFIG,
      planExists: false,
    });
    expect(draft.planMode).toBe(style);
    expect(draft.planFolder).toBe(style === "advanced" ? "tasks" : undefined);
    expect(script.calls.find((call) => call.message === "Plan style")?.initial).toBe("simple");
    expect(script.remaining()).toBe(0);
  },
);

test("advanced folder rejects traversal and existing paths, and accepts a custom name", async ({
  project,
}) => {
  await rm(join(project.cwd, "requirements.md"));
  await mkdir(join(project.cwd, "tasks"));
  const script = scriptedUi([
    "paste",
    "Build checkout",
    "advanced",
    "../outside",
    "tasks",
    "Checkout docs",
  ]);
  const result = await selectPlanRequirements(wizardContext(project.cwd, script.ui));
  expect(result.planFolder).toBe("Checkout docs");
  expect(script.messages.join("\n")).toContain("already exists");
  expect(script.remaining()).toBe(0);
});

test("Back from style preserves entered requirements", async ({ project }) => {
  await rm(join(project.cwd, "requirements.md"));
  const script = scriptedUi([
    "paste",
    "Original work",
    new BackError(),
    "paste",
    "Revised work",
    "simple",
  ]);
  const result = await selectPlanRequirements(wizardContext(project.cwd, script.ui));
  expect(result.requirements.text).toBe("Revised work");
  expect(script.calls.filter((call) => call.kind === "paste")[1]?.initial).toBe("Original work");
});

test("Back from review preserves the advanced style and custom folder", async ({ project }) => {
  await rm(join(project.cwd, "requirements.md"));
  const script = scriptedUi([
    "paste",
    "Build checkout",
    "advanced",
    "checkout",
    new BackError(),
    "paste",
    "Revised work",
    "advanced",
    "checkout",
    true,
  ]);
  const draft = await runPlanWizard({
    ...wizardContext(project.cwd, script.ui),
    config: CONFIG,
    planExists: false,
  });
  expect(draft.planFolder).toBe("checkout");
  expect(script.calls.filter((call) => call.message === "Plan style")[1]?.initial).toBe("advanced");
  expect(
    script.calls.filter((call) => call.message === "Advanced plan folder name")[1]?.initial,
  ).toBe("checkout");
});
