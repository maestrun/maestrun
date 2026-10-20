import type { Task } from "../../contracts/tasks.js";
import type { RunReport } from "../../contracts/run.js";
import type { CommandInput } from "../../shared/command.types.js";
import { UserError, CancelError, BackError } from "../../shared/errors.js";
import { loadConfig } from "../../config/index.js";
import { loadTasks } from "./tasks.js";
import { orchestrationReport } from "./orchestration-state.js";
import { selectRunTasks } from "./task-selection.js";

export async function chooseRunTasks(
  input: CommandInput & { tasksPath?: string },
): Promise<readonly string[] | undefined> {
  const { config } = await loadConfig(input.cwd);
  if (!config) throw new UserError("No saved workflow was found.", "Run maestrun init first.");
  const source = await loadTasks(input.cwd, input.tasksPath ?? "plan.md");
  const report = await orchestrationReport(input.cwd, config, source);
  const tasks = report.orchestration?.tasks ?? source;
  try {
    return await chooseMode(input, report, tasks);
  } catch (error) {
    if (error instanceof BackError) throw new CancelError();
    throw error;
  }
}

async function chooseMode(
  input: CommandInput,
  report: RunReport,
  tasks: readonly Task[],
): Promise<readonly string[] | undefined> {
  while (true) {
    const choice = await input.ui.select(
      "Run tasks",
      [
        { name: "All — run or resume all unfinished tasks", value: "all" },
        { name: "Choose tasks for this run", value: "choose" },
      ],
      "all",
    );
    if (choice === "all") return undefined;
    if (choice !== "choose") throw new CancelError();
    try {
      return await chooseTasks(input, report, tasks);
    } catch (error) {
      if (!(error instanceof BackError)) throw error;
    }
  }
}

async function chooseTasks(
  input: CommandInput,
  report: RunReport,
  tasks: readonly Task[],
): Promise<readonly string[]> {
  const pending = tasks.filter(
    (task) => report.tasks.find((state) => state.id === task.id)?.status !== "completed",
  );
  while (true) {
    const only = await input.ui.checkbox(
      "Tasks for this run — unchecked tasks stay pending",
      tasks.map((task) => ({
        name: `${task.id}: ${task.title}${task.dependsOn.length ? ` (depends on: ${task.dependsOn.join(", ")})` : ""}`,
        value: task.id,
        ...(!pending.includes(task) ? { disabled: "completed" } : {}),
      })),
      pending.map((task) => task.id),
    );
    if (!only.length) throw new CancelError();
    try {
      selectRunTasks(tasks, report, { only });
      return only;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      input.ui.log(`${error.message} ${error.nextAction}`);
    }
  }
}
