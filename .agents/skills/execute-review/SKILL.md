---
name: execute-review
description: Reviews code for correctness, project rules, specification adherence, and test quality, fixing in-scope defects and reporting a verdict. Use for code review or rule compliance; not for feature implementation, PenTest, or QA.
---

# Execute Review

For a feature review, select `--prd` or an unambiguous `tasks/prd-*/` directory;
read `techspec.md`, `tasks.md`, and applicable project instructions. Read
`prd.md` when needed to resolve a requirement. Final feature approval also
requires current `pentest.md` and `qa.md` reports. Save `codereview.md` alongside
those documents using [the template](references/TEMPLATE.md).

For a general code/diff review, inspect the requested patch or files and
applicable repository rules without inventing missing PRD artifacts. Report
findings in the requested destination, or in chat when none was requested.
An early feature review may proceed before PenTest/QA, but its final feature
verdict remains BLOCKED until those required gates pass.

## Workflow

1. **Establish scope and evidence** — identify owning repositories, reviewed
   revision or working diff, requirements, existing reports, and rules that
   actually exist. Read applicable skills only. Check report revisions against
   current code; unrelated changes may be documented, while affected checks
   require fresh evidence. Never claim a missing instruction file was read.
   **Complete when:** scope, rules, report freshness, and gate applicability are clear.

2. **Inspect behavior and contracts** — trace changed paths through callers,
   callees, and boundaries. Check correctness, validation, failure handling,
   permissions, configuration, compatibility, state/concurrency, resource
   lifecycle, and observability as relevant. Compare feature architecture,
   components, interfaces, models, and integrations with the TechSpec. Record
   justified deviations instead of reporting preferences as rule violations.
   **Complete when:** each finding has evidence, impact, and an applicable rule
   or requirement where relevant.

3. **Verify tasks and tests** — for feature work, check implemented subtasks,
   `CA-*` traceability, dependencies, and mapped tests. Review test behavior and
   important failure paths rather than requiring coverage for cosmetic edits.
   Discover commands from project instructions, package scripts, or CI; run
   relevant lint, typecheck, test, and build checks and configured coverage.
   Record command, result, revision, and limitations. If services are needed,
   use isolated data and available project-configured ports; otherwise use
   backend `3000–3099` and frontend `5100–5199`. Record owned resources.
   **Complete when:** applicable checks have PASS, FAIL, BLOCKED, or NOT
   APPLICABLE outcomes, with reasons for incomplete or inapplicable checks.

4. **Fix and revalidate** — fix in-scope defects at their root cause and add
   meaningful regression coverage. For a material PRD/TechSpec/scope decision,
   describe the blocker and ask only if existing authorization does not resolve
   it. Rerun affected checks. Fixes invalidating security or functional evidence
   require affected PenTest/QA cases to be repeated before final approval.
   **Complete when:** findings are resolved or explicitly recorded as remaining.

5. **Report and clean up** — list findings by severity with file/line, trigger,
   impact, and suggested fix; distinguish them from optional recommendations.
   Save the feature report and choose a verdict:
   - **APPROVED** — applicable requirements and required gates pass.
   - **APPROVED WITH NOTES** — required gates pass; remaining notes are non-blocking.
   - **REJECTED** — a confirmed blocking defect or failed required check remains.
   - **BLOCKED** — a prerequisite, current gate evidence, or required check is unavailable.

   A missing check never becomes approval with notes. State explicitly when no
   findings were identified and disclose validation limits. Stop only resources
   started by this run and clean only its test data, including on interruption.
