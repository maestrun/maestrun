# Repository instructions

Every repository change must be delivered through a pull request, including
code, tests, documentation, configuration, dependencies, and agent guidance.
Before editing any files, create or switch to a topic branch for the task.
All edits and commits must happen on that branch, never on the default branch
or in detached HEAD. If work already exists on the default branch, preserve
it by creating a topic branch before continuing. Target the appropriate base
branch through a PR; never push changes directly to the default branch or
bypass the PR workflow.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for repository patterns and required
validation. Use the [PR template](.github/pull_request_template.md) and report
actual test results. Keep incomplete work in a draft PR; do not mark it ready
for review until required checks pass. Local preparation is not merged delivery.
Honor the user's requested delivery scope and existing authorization.

## Skills

All skills in [.agents/skills/](.agents/skills/) are enabled for automatic
selection when their descriptions match the task. Read and follow the relevant
`SKILL.md` files; do not load unrelated skills or run every workflow for every
change. Explicit user instructions take precedence over skill defaults.

Use [Impeccable](.agents/skills/impeccable/SKILL.md) when designing or implementing
new frontend features and when improving existing interfaces. Include it from
the start of UI work, alongside applicable implementation and validation skills.
