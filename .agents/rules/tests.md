# Testing rules

These rules apply to application code and tests in the backend, frontend, and
E2E-test repositories defined in [folder-structure.md](folder-structure.md).

<critical>
## Critical requirement

- **Every code change must be covered by automated tests. This rule is critical
  and must not be skipped or waived.**
- Maintain at least 80% automated test coverage for both the backend and the
  frontend. Coverage is a minimum signal, not a substitute for validating
  behavior.
- Prioritize tests according to business risk. Critical workflows, such as
  authentication, authorization, alert processing, and external integration
  boundaries, require deeper coverage than low-impact CRUD behavior.
</critical>
## FIRST principles

Follow the relevant FIRST testing principles. The Timely principle is not
required for this project.

- **Fast:** Keep the suite quick to run. Stub slow external dependencies and
  avoid unnecessary network, filesystem, container, or timing work in unit
  tests.
- **Independent:** Each test must create and clean up its own state. Tests must
  not depend on another test, shared mutable state, or execution order.
- **Repeatable:** Repeated runs must produce the same result. Control clocks,
  randomness, generated data, and external API responses with deterministic
  fakes, stubs, or mocks.
- **Self-validating:** Tests must fail when behavior is wrong. Assert meaningful
  outputs, state changes, errors, and side effects instead of testing only that
  code executes or increases coverage.

## Structure and scope

- Keep backend unit tests in the backend repository's `tests/unit/<capability>/`
  and integration tests in `tests/integration/`. Fixtures, helpers, and setup
  also belong under that repository's root `tests/`; do not colocate backend
  tests with production code or create test directories inside `src`.
- Write tests in the order that most efficiently establishes correct behavior:
  critical requirements and failure paths first, then the primary success path,
  edge cases, and lower-risk behavior.
- Use Given/When/Then or Arrange/Act/Assert consistently so setup, behavior,
  and verification are easy to identify.
- Test one specific context or behavior per test. Do not combine unrelated
  scenarios or give a test multiple behavioral reasons to fail.
- Derive assertions from requirements and observable behavior. Avoid assertions
  that merely repeat implementation details.
- Use Vitest for backend and frontend unit and integration tests. Prefer
  Playwright for end-to-end tests.

## Test pyramid

- Keep a broad base of fast unit tests, a smaller set of integration tests, and
  a focused set of end-to-end tests for critical user and system workflows.
- Backend and frontend code both require comprehensive unit and integration
  coverage appropriate to their risks and boundaries.
- Keep deployed-stack end-to-end tests in the separate E2E-test repository's
  `tests/e2e/`, as defined in `folder-structure.md`.
- Use the lowest test level that proves the requirement. Reserve integration
  tests for real boundaries and end-to-end tests for workflows that must be
  verified across the complete stack.
