import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { taskChannel } from "../../src/modules/execution/task-conversation.js";
import {
  conversationPath,
  readConversation,
  sendTaskMessage,
} from "../../src/modules/execution/task-conversation.repository.js";
import { maestrunHome } from "../../src/shared/home.js";
import { test } from "../helpers/project.js";
import { sessionCli } from "../helpers/session-cli.js";
import { CONFIG } from "../helpers/context.js";
import { loadConfig, saveConfig } from "../../src/config/index.js";

test("stores conversations in the home folder, isolated by project", async ({ project }) => {
  const id = randomUUID();
  const channel = await taskChannel(project.cwd, id);
  const path = conversationPath(project.cwd, id);
  expect(path.startsWith(join(maestrunHome(), "conversations"))).toBe(true);
  expect(conversationPath(project.bin, id)).not.toBe(path);
  channel.output("Home conversation");
  await channel.close();
  expect(JSON.parse(await readFile(`${path}.json`, "utf8"))).toMatchObject({
    active: false,
    messages: [{ text: "Home conversation" }],
  });
  expect(await readConversation(project.bin, id)).toBeUndefined();
  expect(await readdir(project.cwd)).not.toContain(".maestrun");
});

test("legacy conversations remain readable and accept messages while active", async ({
  project,
}) => {
  const id = randomUUID();
  const path = join(project.cwd, ".maestrun/conversations", id);
  await mkdir(path, { recursive: true });
  await writeFile(`${path}.json`, JSON.stringify({ active: true, messages: [] }));
  expect(await readConversation(project.cwd, id)).toEqual({ active: true, messages: [] });
  await sendTaskMessage(project.cwd, id, "Continue");
  expect(await readdir(path)).toHaveLength(1);
});

test("CLI saves and selects a template, showing a table before confirmation", async ({
  project,
}) => {
  await saveConfig(project.cwd, CONFIG, { exists: false, content: "" });
  const save = sessionCli(project.cwd, ["template", "save", "team"]);
  try {
    await save.wait("Save template team?");
    expect(save.output()).toContain("Stage / target");
    save.send("y\r");
    expect(await save.exited).toBe(0);
  } finally {
    save.kill();
  }
  const destination = join(project.root, "other");
  await mkdir(destination);
  const init = sessionCli(destination, ["init", "--template"]);
  try {
    await init.wait("Choose a workflow template");
    init.send("\r");
    await init.wait("Initialize this project with template team?");
    expect(init.output()).toContain("codex-test");
    expect((await loadConfig(destination)).config).toBeUndefined();
    init.send("y\r");
    expect(await init.exited).toBe(0);
    expect((await loadConfig(destination)).config).toEqual(CONFIG);
  } finally {
    init.kill();
  }
});
