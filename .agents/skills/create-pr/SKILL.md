---
name: create-pr
description: Prepares, opens, or updates a pull request with repository conventions, required test evidence, and a focused description. Use when asked to create a PR, prepare changes for a PR, or update its title and description; not for standalone code review, feature implementation, or merging.
---

# Create PR

Prepare a reviewable pull request for the requested changes. Follow the
repository's contribution policy and applicable rules; keep test requirements
in their existing sources rather than inventing a separate PR policy.
Every repository change requires a PR, including documentation, configuration,
dependencies, and agent guidance. Before editing any files, create or switch
to a topic branch for the task. Make all edits and commits on that branch,
never on the default branch or in detached HEAD. Preserve existing changes
on the default branch by creating a topic branch before continuing. Never push
changes directly to the default branch or bypass the PR workflow. Local
preparation alone does not satisfy PR delivery.
Preparing a PR description alone does not authorize committing or publishing.
A request to open a PR authorizes the necessary branch push and PR creation;
honor existing session authorization without asking again. Merging and releasing
require their own authorization.

## Workflow

1. **Establish scope and conventions** — inspect Git status, remotes, the
   current branch, intended base, branch commits, and the full base-to-head
   diff, including staged, unstaged, and untracked work when relevant. Discover
   the upstream default branch rather than assuming `main`. Check for an
   existing PR for this head/base pair before creating another.
   Read applicable `AGENTS.md`, [CONTRIBUTING.md](../../../CONTRIBUTING.md),
   [code standards](../../rules/code-standards.md),
   [language rules](../../rules/javascript-typescript.md),
   [folder structure](../../rules/folder-structure.md), and
   [testing rules](../../rules/tests.md). Inspect any PR template, package
   scripts, test configuration, and relevant CI workflows. Follow established
   title conventions when documented; do not invent a required prefix.
   **Complete when:** intended changes, target repository/base, applicable
   patterns, and delivery scope are clear.

2. **Check readiness** — compare the diff with surrounding patterns, public
   module boundaries, documented behavior, and applicable requirements.
   Include documentation and compatibility changes when relevant. Preserve
   unrelated user work; stage only intended files if committing is authorized.
   Exclude generated output, local state, credentials, and unrelated formatting.
   For planned features, read existing PRD, TechSpec, tasks, and required
   review/QA/security evidence when the feature workflow requires them; check
   that evidence still applies. Do not require these artifacts for ordinary
   changes or report a missing gate as passed.
   **Complete when:** the diff is focused and unresolved readiness gaps are known.

3. **Verify tests and checks** — use the validation requirements below. Fix
   in-scope failures and rerun affected checks after revisions. Record the exact
   command, result, and tested revision or working-tree state. Reuse existing
   evidence only when it demonstrably covers the final changes. Mark unavailable
   checks BLOCKED and inapplicable checks NOT APPLICABLE with reasons.
   **Complete when:** every required check has an evidence-backed outcome.

4. **Write the PR** — use the
   [PR template](../../../.github/pull_request_template.md) and write a concise
   English description covering the problem, resulting
   behavior, related issue, compatibility or documentation changes, test
   results, and remaining limitations as applicable. Lead with the concrete
   problem and outcome. Include a before/after example when it clarifies the
   change. Report actual results, including failures and skipped checks; never
   turn planned tests into completed tests. Scale detail to the diff and rewrite
   stale titles/descriptions around the final scope.
   **Complete when:** the title and body are concrete and ready to review.

5. **Deliver within scope** — if only preparation was requested, return the
   title, body, and readiness status. If opening/updating is authorized, verify
   remote and head/base, push the intended branch normally, and create or update
   the PR. Use a draft when work or required validation remains incomplete;
   disclose blockers and do not request review until required gates pass.
   Do not force-push, merge, or publish a release as part of this workflow.
   Use structured tool arguments or a temporary UTF-8 body file with
   `gh pr create --body-file` / `gh pr edit --body-file` to preserve Markdown
   and avoid shell interpolation. Verify the resulting PR's URL, title, base,
   head, body, and draft status. Report tool/authentication failures accurately
   and retain the prepared description for handoff.
   **Complete when:** the requested local artifact or remote PR exists and its
   actual validation and delivery status are reported.

## Validation requirements

- Cover every application code change with automated tests, including a
  regression test for each bug fix. Verify observable outcomes and relevant
  failure paths, using the lowest test level that proves the behavior. Keep
  tests fast, independent, repeatable, and self-validating. Fake external
  executors; automated checks must not consume paid model access.
- Follow this CLI's documented and configured layout: `src/**/*.test.ts` for
  unit tests, `tests/integration/` for integration tests, and `tests/helpers/`
  for shared helpers. The backend-specific layout in the generic testing rule
  does not describe this CLI; use `CONTRIBUTING.md` and `vitest.config.ts` for
  its layout. Preserve applicable behavioral test requirements.
- For code or configuration changes, run from the repository root:

  ```sh
  npm run check
  npm run test:coverage
  npm run build
  ```

  Require at least 80% coverage for lines, statements, functions, and branches,
  as configured in `vitest.config.ts`. A focused test or `npm test` alone does
  not replace the coverage gate. Do not lower thresholds, exclude changed code,
  or skip failing tests to obtain a pass.
- For documentation-only changes, check every changed Markdown file with the
  installed Prettier and verify links and command examples. Pass agent guidance
  paths explicitly because `npm run format:check` does not include `.agents/`.
  Runtime tests and builds are not required for prose-only changes.
- For installation or package-content changes, also run `npm run release:pack`.
  It creates a local archive and does not publish; keep the archive uncommitted.
- For terminal output or interactive prompt changes, exercise the affected flow
  and include a short transcript or screenshot, with OS, terminal, and executor
  details where relevant. Disclose unavailable manual verification.
- Inspect current scripts and configuration before running these commands. If
  they change, follow the current documented equivalents and retain the gates.
  Distinguish local validation from remote CI; never claim CI passed without
  checking it, and do not treat release-only CI as a PR check.
