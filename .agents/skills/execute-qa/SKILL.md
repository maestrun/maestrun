---
name: execute-qa
description: Validates and stabilizes an implemented feature against its PRD, TechSpec, and tasks after PenTest, with tests, UI checks, bug fixes, and evidence. Use when asked to execute QA; not for new feature implementation or code review.
---

# Execute QA

Select `--prd` or an unambiguous feature in `tasks/prd-*/`; ask if several
match. Require `prd.md`, `techspec.md`, `tasks.md`, relevant task files, and a
passing current `pentest.md`. Read applicable project instructions/rules that
exist. Maintain `qa.md` using [the template](references/TEMPLATE.md) and save
sanitized evidence in the feature's `evidences/` directory.

Approve only when every acceptance criterion is verified and met, applicable
required checks pass, and the PenTest gate has no unresolved high/critical
finding. Discover the available browser tool or installed project runner for
UI checks; never assume a named MCP tool exists. Missing required capabilities
mean BLOCKED, not a passing browser result.

## Workflow

1. **Map requirements and check the gate** — verify completed implementation
   and the PenTest scope/revision against current code. Map each `CA-*` to
   relevant `TU-*`, `TI-*`, `E2E-*`, or a documented manual verification case.
   Record environment and repository revision/working diff. Identify missing
   mappings before testing; do not invent completed tests.
   **Complete when:** all criteria have a verification method and current
   security-gate evidence is available.

2. **Prepare** — discover actual lint, typecheck, test, build, and coverage
   commands from instructions, package scripts, or CI. Start only required
   services with isolated test data and project-configured available ports,
   otherwise backend `3000–3099` and frontend `5100–5199`. Check ports before
   binding, configure inter-service URLs, and isolate databases, queues,
   storage, and outbound integrations. Record owned resources.
   **Complete when:** applicable API/UI targets respond and tools are available.

3. **Run flows and automated checks** — execute mapped unit/integration cases
   and UI E2E flows, checking observable application state. For failures,
   inspect UI state, console errors, network responses, and backend logs.
   Cover relevant happy, empty, failure, denied-access, and recovery states.
   Record exact commands/steps, expected and actual behavior, case IDs, and
   evidence links. Evaluate coverage against the project's configured target.
   Use PASS, FAIL, BLOCKED, or NOT APPLICABLE; give reasons for the latter two.
   **Complete when:** every criterion and required case has a recorded outcome.

4. **Check applicable UI quality** — use browser evidence for:
   - Keyboard flow, focus visibility/order/restoration, and control semantics
   - Accessible names, labels, errors, images, and status announcements
   - Contrast, zoom/reflow, reduced motion, and relevant responsive viewports
   - Empty, loading, populated, and error states without layout/interaction defects

   Automated accessibility scans supplement manual keyboard checks. For API-
   only features, mark UI checks NOT APPLICABLE with a reason. Sanitize screen,
   console, network, and log artifacts before saving.
   **Complete when:** relevant screens/states/viewports are checked and defects recorded.

5. **Fix and revalidate** — fix root causes within scope, add meaningful
   regression coverage, and record defect severity, reproduction, fix, and
   status. Ask only for material scope decisions unresolved by authorization.
   Repeat failed cases and affected checks after fixes. Changes to auth,
   validation, data boundaries, or security controls require affected PenTest
   retests before QA approval. Do not repeatedly rerun unaffected passing checks.
   **Complete when:** all criteria pass and no required check or blocking defect remains.

6. **Report and clean up** — save `qa.md` with:
   - **APPROVED** — all criteria and required gates pass.
   - **FAILED** — a confirmed unmet criterion or blocking defect remains.
   - **BLOCKED** — a required prerequisite, tool, or check is unavailable.

   Include tests run, defects/fixes, revision, coverage, and evidence. Stop only
   services started by this run and clean only its test data; perform the same
   cleanup on interruption. Preserve existing report history when resuming.
