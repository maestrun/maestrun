# Repository instructions

Every repository change must be merged through a pull request, including
code, tests, documentation, configuration, dependencies, and agent guidance.
Before editing any files, create or switch to a topic branch for the task.
All edits and commits must happen on that branch, never on the default branch
or in detached HEAD. If work already exists on the default branch, preserve
it by creating a topic branch before continuing. Target the appropriate base
branch through a PR; never push changes directly to the default branch or
bypass the PR workflow.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for repository patterns and required
validation. Implement and validate the task locally, then report the result.
Create or update a PR only when the user explicitly asks; a task request does
not authorize opening a PR, including a draft. Wait for the user to request
the PR after the task is ready. Do not push a branch just to open a PR early.
When requested, use the [PR template](.github/pull_request_template.md) and
report actual test results. Keep requested PRs in draft while required work
or checks remain incomplete. Local preparation is not merged delivery.

## Skills

All skills in [.agents/skills/](.agents/skills/) are enabled for automatic
selection when their descriptions match the task. Read and follow the relevant
`SKILL.md` files; do not load unrelated skills or run every workflow for every
change. Explicit user instructions take precedence over skill defaults.

Use [Impeccable](.agents/skills/impeccable/SKILL.md) when designing or implementing
new frontend features and when improving existing interfaces. Include it from
the start of UI work, alongside applicable implementation and validation skills.
