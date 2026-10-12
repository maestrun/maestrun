# Maestrun

Configure, plan, and run coding tasks with Codex, Claude Code, GitHub Copilot CLI, or Grok Build.

**Simple guide:** install → start → review → run. For custom workflows, templates, task formats, and integrations, see the [advanced guide](docs/advanced.md).

## 1. Install

You need **Node.js 24 LTS** (also supported: 22.13+ and 26+) and Linux, macOS, or WSL. On Windows, run `wsl --install`, then install Node and your executor inside Linux.

Install the CLI from npm:

```sh
npm install --global @maestrun/maestrun
```

No build step is needed. To update, run `npm install --global @maestrun/maestrun@latest`. [Building from source](docs/advanced.md#development-and-releases) is also supported.

Install and sign in to at least one executor:

| Executor       | Installation                                                | Sign in             |
| -------------- | ----------------------------------------------------------- | ------------------- |
| Codex          | `npm install -g @openai/codex`                              | `codex login`       |
| Claude Code    | [Installation guide](https://code.claude.com/docs/en/setup) | `claude auth login` |
| GitHub Copilot | `npm install -g @github/copilot`                            | `copilot login`     |
| Grok Build     | `npm install -g @xai-official/grok`                         | `grok login`        |

Planning and execution use your executor account and consume its usage.

## 2. Start a project

```sh
cd /path/to/your/project
maestrun start
```

Maestrun checks your environment, configures the workflow, collects requirements, creates a plan, and asks before running tasks. Existing configuration, plans, and progress are reused.

For a new workflow, choose:

1. An available executor.
2. An exact model.
3. **Standard** or **Customize**.

**Standard** runs Planning → Implementation → Tests sequentially with the same executor and model. Review the settings table before saving.

## 3. Review and resume

| What you need                                        | Command                  |
| ---------------------------------------------------- | ------------------------ |
| Check installation, authentication, files, and locks | `maestrun doctor`        |
| Preview tasks without model calls                    | `maestrun run --dry-run` |
| Run or resume unfinished tasks                       | `maestrun run`           |
| Reconnect to a background session                    | `maestrun`               |
| Read the saved report                                | `maestrun run --status`  |
| See all options                                      | `maestrun --help`        |

During a run, **Enter** opens task details. **Ctrl+C** offers background execution or cancellation. After a failure, choose **View evidence**, **Adjust configuration**, or **Resume**.

Failed model checks can trigger up to **5 automatic repair cycles** per task. [Configure repairs or isolated parallel execution](docs/advanced.md#parallel-worktrees).

Keep `.maestrun/run.json`: it stores completed work. For startup problems, run `maestrun doctor` and follow its next actions.

## Go further

- [Configure stages, models, effort, and parallel execution](docs/advanced.md#workflow-and-configuration)
- [Reuse a workflow across projects](docs/advanced.md#templates)
- [Plan separately and edit task documents](docs/advanced.md#planning-and-task-format)
- [Run in the background and recover after a crash](docs/advanced.md#execution-and-recovery)
- [Customize the terminal or add integrations](docs/advanced.md#terminal-and-layout)

Try a small sample using your model:

```sh
maestrun sample           # Simple: 2 sequential tasks, implementation and tests
maestrun sample advanced  # Advanced: 3 tasks, automatic QA repair and parallel integration
```

Both use Node.js built-ins with no package installation. Each run creates a separate sample folder. [Tasks and details](docs/advanced.md#sample).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, required checks, and how to submit a pull request.

## License

Maestrun is licensed under the [Sustainable Use License v1.0](LICENSE) (`SUL-1.0`).
