# Maestrun

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="Maestrun" width="420">
  </picture>
</p>

**Quick to set up. Easy to run. Yours to customize.**

> **Beta:** Maestrun is still in Beta, so you may encounter bugs. Contributions are welcome—feel free to open issues or submit pull requests to help improve the project.

Maestrun turns coding requirements into a plan and runs tasks with **Codex, Claude Code, GitHub Copilot CLI, or Grok Build**. Start with a guided workflow, review the plan, and follow each task through implementation and tests.

Choose one executor and model for the whole workflow, or assign different ones to each stage. Your settings stay in a readable, editable **`config.json`**.

**Install → start → review → run.** [Advanced guide](docs/advanced.md)

## Why Maestrun?

- **A short path to your first run.** Install from npm, run `maestrun start`, and choose your executor, model, and workflow. Environment checks help you resolve setup problems before planning.
- **A clear view of the work.** Follow task progress, inspect stage output, send instructions, and reconnect to background runs.
- **Customization at your own pace.** Use the standard workflow, adjust settings in the terminal, or edit JSON directly. Add custom steps with Markdown instructions.
- **A setup you can reuse.** Save workflows as templates, including step instructions, and export them for another project or machine.
- **Progress you can resume.** Completed tasks and stages are saved. Configurable repair cycles handle model-reported failures, and parallel tasks run in separate Git worktrees.

## 1. Install

You need **Node.js 24 LTS** (also supported: 22.13+ and 26+) and **Linux, macOS, or WSL**. On Windows, run `wsl --install`, then install Node, Maestrun, and your executor inside Linux.

```sh
npm install --global @maestrun/maestrun@beta
```

The npm package includes compiled code. To update:

```sh
npm install --global @maestrun/maestrun@beta
```

Install and sign in to **at least one** executor:

| Executor       | Installation                                                | Sign in             |
| -------------- | ----------------------------------------------------------- | ------------------- |
| Codex          | `npm install -g @openai/codex`                              | `codex login`       |
| Claude Code    | [Installation guide](https://code.claude.com/docs/en/setup) | `claude auth login` |
| GitHub Copilot | `npm install -g @github/copilot`                            | `copilot login`     |
| Grok Build     | `npm install -g @xai-official/grok`                         | `grok login`        |

Planning, execution, and samples use your executor account and consume its usage. [Building from source](docs/advanced.md#development-and-releases) is also supported.

## 2. Start, review, and run

```sh
cd /path/to/your/project
maestrun start
```

Maestrun checks your environment and guides you through setup. For a new workflow, choose:

1. An available executor.
2. An exact model from the available catalog, or enter its ID manually.
3. **Standard** or **Customize**.

**Standard** uses the same executor and model for **Planning → Implementation → Tests**, with sequential execution. Review the settings table, provide your requirements, and review the task preview before starting execution.

Existing configuration, plans, and progress are reused. You can return to the same project and run `maestrun start` again.

## 3. Make the workflow yours

Open the full editor whenever you need more control:

```sh
maestrun init --advanced
```

Choose stages, assign an executor, model, and effort to each one, add custom steps, or enable parallel execution. You can also change individual settings directly:

```sh
maestrun config                              # Show effective settings
maestrun config execution.maxRepairs 3       # Set the repair limit
maestrun config stages planning effort high # Adjust planning effort
```

Use an effort level supported by the selected executor and model. Configuration commands validate changes before saving; invalid changes preserve the file.

Prefer your editor? Open **`.maestrun/config.json`**. A basic workflow looks like this:

```json
{
  "version": 1,
  "stages": [
    { "id": "planning", "executor": "codex", "model": "your-model-id" },
    { "id": "implementation", "executor": "codex", "model": "your-model-id" },
    { "id": "testing", "executor": "codex", "model": "your-model-id" }
  ],
  "execution": { "mode": "sequential" }
}
```

Replace the placeholders with an exact model ID available to your account. To use another executor or model for a stage, edit that stage's entry. Custom step instructions live in `.maestrun/steps/*.md`.

Save a workflow to reuse it:

```sh
maestrun template save my-workflow
cd /path/to/another/project
maestrun init --template
```

See [configuration and global defaults](docs/advanced.md#workflow-and-configuration), [portable templates](docs/advanced.md#templates), and [extensions](docs/advanced.md#extensions-and-host-plugins).

## Follow progress and resume

| What you need                                        | Command                     |
| ---------------------------------------------------- | --------------------------- |
| Check installation, authentication, files, and locks | `maestrun doctor`           |
| Preview tasks without model calls                    | `maestrun run --dry-run`    |
| Run or resume unfinished tasks                       | `maestrun run`              |
| Start execution in the background                    | `maestrun run --background` |
| Reconnect to a background session                    | `maestrun`                  |
| Read the saved report                                | `maestrun run --status`     |
| See all options                                      | `maestrun --help`           |

During an interactive run, **Enter** opens task details, **F** shows the stage flowchart, and **I** lets you send instructions to a running model task. **Ctrl+C** offers background execution or cancellation.

Model-reported failures can trigger up to **5 automatic repair cycles per task per run** by default. You can change this limit or disable repairs. After a failure, choose **View evidence**, **Adjust configuration**, or **Resume**. Executor errors and timeouts stop the affected task immediately.

Keep **`.maestrun/run.json`**: it stores completion checkpoints. Parallel runs also need their retained worktrees for recovery. See [execution and recovery](docs/advanced.md#execution-and-recovery) and [parallel worktrees](docs/advanced.md#parallel-worktrees) for requirements and integration behavior.

## Try a small sample

```sh
maestrun sample          # 2 sequential tasks: implementation and tests
maestrun sample advanced # 3 tasks: parallel execution, QA repair, and integration
```

Each run creates a separate sample folder and uses your selected model. Both samples use Node.js built-ins, with no dependency installation. The advanced sample requires **Git 2.38+**. [Sample tasks and details](docs/advanced.md#sample)

## Go further

- [Plan separately and edit Markdown tasks](docs/advanced.md#planning-and-task-format)
- [Configure isolated parallel execution](docs/advanced.md#parallel-worktrees)
- [Customize the terminal layout](docs/advanced.md#terminal-and-layout)
- [Add extensions or use the Codex and Claude plugins](docs/advanced.md#extensions-and-host-plugins)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, required checks, and how to submit a pull request.

## License

Maestrun is licensed under the [Sustainable Use License v1.0](LICENSE) (`SUL-1.0`).
