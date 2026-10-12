---
name: maestrun
description: Run or inspect tasks through the Maestrun CLI when the user requests a Maestrun workflow. Use the saved stage, model, effort, target and execution settings.
---

Run commands in the user's project directory. The `maestrun` executable must
be installed and on PATH. Start with `maestrun --help` if command availability
is uncertain. Report a missing executable; do not install software implicitly.

- Inspect progress with `maestrun run --status`. It returns the saved JSON report.
- Before a requested execution, use `maestrun run --dry-run` to validate tasks
  and show stage/model assignments. Then run `maestrun run` when execution is
  within the user's request. Stay with the process until it exits; report failed,
  blocked and cancelled tasks from the report. A requested retry resumes unfinished
  steps and skips saved completed work. Preserve `.maestrun/run.json`; never delete
  it to recover from a crash. Inspect partial changes before retrying an interrupted step.
- Pass `--tasks <file>` to select editable Markdown tasks. Quote paths as shell
  arguments. Each task uses `### Task task-1: Title`, followed by
  `- Depends on: none` (or comma-separated IDs), optional `- Target: frontend`
  or `backend`, then Markdown scope, acceptance criteria and verification.
  Use level 4 headings inside tasks. Root plans may link to `[tasks.md](tasks/tasks.md)`;
  execution reads the linked file directly, including user edits. Legacy JSON
  manifests and fenced `maestrun-tasks` JSON blocks remain supported.
  For one file per task, use checklist links in `tasks.md`, such as
  `- [ ] [API](api.md)`. Each file starts with `# Task api: Title`, the same
  metadata, and Markdown instructions. Dependencies can refer to other files' task IDs.
- Setup uses `maestrun init`. Question-driven planning uses
  `maestrun plan --interactive`. These require a real interactive terminal;
  explain the exact command to the user when the host has no terminal input.
  Never pipe invented answers into a wizard.

Preserve `.maestrun/config.json` and `plan.md`. Only edit their settings when
requested. Extensions listed in `config.plugins` execute local JavaScript with
process permissions; do not add unreviewed extensions on the user's behalf.
Maestrun delegates task execution to installed Codex/Claude executors; it does
not authorize deployment, messaging, publishing, or changes outside the task.
