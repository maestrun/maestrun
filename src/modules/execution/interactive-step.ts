import type { StepInput } from "../../contracts/run.js";
import { taskChannel } from "./task-conversation.js";
import { codexTaskSession } from "./codex-task-session.js";
import { headlessTaskSession } from "./headless-task-session.js";
import { claudeTaskSession } from "./claude-task-session.js";

export async function interactiveStep(input: StepInput, prompt: string): Promise<string> {
  if (!input.conversationId) throw new Error("Missing task conversation");
  const channel = await taskChannel(input.projectCwd ?? input.cwd, input.conversationId);
  try {
    return await {
      codex: codexTaskSession,
      claude: claudeTaskSession,
      copilot: headlessTaskSession,
      grok: headlessTaskSession,
    }[input.stage.executor](input, prompt, channel);
  } finally {
    await channel.close();
  }
}
