---
name: create-techspec
description: Creates or updates a technical specification from an existing PRD. Use for feature architecture, contracts, and testing strategy; not for product requirements or task decomposition.
---

# Create TechSpec

The `--prd` argument identifies the feature slug. Otherwise use an unambiguous
feature from the request or `tasks/prd-*/`; ask when several candidates match.
Require `tasks/prd-[slug]/prd.md`; if absent, identify the missing prerequisite
and point to create-prd instead of inventing requirements.

Define architecture, components, contracts, and tests without implementing.
Reference the PRD rather than repeating its problem and scope. Keep code to
interface examples and use the simplest architecture that meets requirements.

## Workflow

1. **Analyze** — read the PRD in full, any existing TechSpec, and related tasks.
   Extract requirements, acceptance IDs, constraints, and success metrics.
   **Complete when:** scope and existing decisions are understood.

2. **Explore** — read applicable `AGENTS.md` and `.agents/rules/` files that
   exist; record absence honestly. Inspect affected modules, interfaces,
   callers, configuration, persistence, tests, infrastructure, package files,
   and lockfiles. Identify owning repositories in a multi-repository project.
   Reuse established patterns and libraries. Verify version-sensitive behavior
   with official documentation for the installed versions. Delegate exploration
   only when authorized and supported by the host.
   **Complete when:** every new or changed component has an evidenced location.

3. **Resolve gaps** — use the available question tool or plain chat only for
   material decisions exploration cannot resolve: contracts, trust boundaries,
   private business rules, migration/rollback, failure modes, or dependencies.
   Record non-blocking assumptions and their consequences.
   **Complete when:** no blocking technical decision remains unspecified.

4. **Specify** — read [the template](references/TEMPLATE.md) and preserve its
   sections. Define types, validation, authentication/authorization, success
   and error contracts, relevant timeouts, cancellation, retries, idempotency,
   observability, compatibility, and data migrations. Mark irrelevant sections
   NOT APPLICABLE with reasons. Inventory the project's real check commands
   and coverage targets. Assign stable `TU-*`, `TI-*`, and `E2E-*` cases and
   link them to `CA-*`; cover every criterion with an applicable verification
   method. List applicable skills and actual repository rules consulted.
   **Complete when:** contracts and failure behavior are implementable,
   acceptance coverage is complete, and operational risks have mitigations.

5. **Save and verify** — save `tasks/prd-[slug]/techspec.md`. Check identifier
   references, file paths, PRD alignment, and test coverage of criteria.
   Preserve IDs on updates and flag downstream tasks requiring revision.
   Report the document and unresolved non-blocking assumptions.
