---
name: execute-task
description: Implements or resumes a feature task from its PRD, TechSpec, and task files, verifies it, and records delivery status. Use for planned implementation tasks; not for code review, PenTest, or QA.
---

# Execute Task

Use `--prd` or an unambiguous feature from the request or `tasks/prd-*/`;
ask when several candidates match. Require `prd.md`, `techspec.md`, `tasks.md`,
and the selected `task_[num].md`. Report missing prerequisites rather than
inventing them. This skill covers planned tasks; ordinary small fixes do not
require creating the full documentation workflow.

## Workflow

1. **Select and inspect** — read applicable repository instructions, project
   rules, feature documents, task definition, and actual Git status. Confirm
   dependency tasks are delivered; verify tracking against code and relevant
   merged history rather than trusting checkboxes alone. Identify each owning
   repository from the project configuration. Inspect its base branch, remote,
   and documented delivery policy instead of assuming `main` or repository
   names. Resume an existing task branch when appropriate.
   **Complete when:** the selected task, dependencies, and current progress are clear.

2. **Prepare safely** — preserve user edits and existing checkout state. If
   isolation is needed, create a task worktree/branch from the appropriate
   base; do not automatically stash edits, switch the user's branch, or reset
   their checkout. Fetch when remote state is needed and access is available;
   record unavailable remote verification. Load only applicable skills and
   inspect documented commands, runtime versions, and existing dependencies.
   If services are needed, use project-configured available ports, or default
   to backend `3000–3099` and frontend `5100–5199`; check before binding. Keep
   databases, test accounts, queues, and outbound integrations isolated. Record
   process/container ownership and configure inter-service URLs.
   **Complete when:** work can proceed without disturbing another environment.

3. **Implement and verify** — implement every selected subtask in dependency
   order, following the TechSpec and applicable rules. Reuse existing patterns.
   Run relevant documented checks and task tests; add meaningful regression
   coverage for behavior changes. Treat unavailable required checks as BLOCKED,
   not PASS. Resolve failures and rerun affected checks. For a material scope
   change, prepare the decision and ask only if authorization is missing.
   **Complete when:** scope is implemented and required checks pass.

4. **Deliver according to policy** — inspect any configured delivery helper
   before running it; verify required tools, arguments, credentials, remote,
   CI/approval behavior, and authorization. `scripts/deliver-task.sh` is a
   project path in the owning repository, not a bundled skill resource; use
   it only when it exists and the project adopts that workflow. A helper does not grant
   permission to push, merge, publish, or change a shared branch. Prepare a
   concrete diff and validation evidence before any needed approval. Follow
   authorized commit/PR/merge requirements, cross-link multi-repository work,
   and record actual delivery state. If no policy requires merged delivery,
   report the validated local implementation without inventing a PR.
   **Complete when:** authorized delivery requirements are met, or the exact
   remaining delivery step is documented.

5. **Track and clean up** — update task and subtask checkboxes only after the
   project's completion gate is satisfied: validated implementation by default,
   post-merge documentation when the project requires it. Keep `tasks.md` and
   `task_[num].md` consistent and link validation/delivery evidence. If a gate
   remains blocked, leave completion unchecked and record the blocker. Stop
   only resources started by this run and remove only its temporary test data;
   use the same cleanup on interruption. Report changed files, checks, actual
   task status, and any remaining blocker.
