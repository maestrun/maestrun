---
name: developing-node-backends
description: Builds, reviews, and troubleshoots Node.js and TypeScript backends. Use for APIs, services, workers, integrations, and backend runtime behavior. Adapts to the project's framework, database, messaging, and deployment choices.
---

# Developing Node Backends

## Workflow

1. Read applicable repository instructions and inspect the runtime version,
   package manager, architecture, and verification commands. Preserve existing
   technology choices and conventions.
2. For implementation or review, consult
   [references/original-rules.md](references/original-rules.md). Apply only
   relevant sections; they do not prescribe a framework, directory layout,
   database, broker, or deployment platform.
3. For changes involving I/O, streams, timers, packages, or instrumentation,
   consult [references/additional-best-practices.md](references/additional-best-practices.md).
   Select patterns supported by the project's Node.js version.
4. Trace affected entry points, business logic, and external adapters. Preserve
   public contracts, validate untrusted input at boundaries, and keep transport
   concerns separate from business logic using existing abstractions.
5. Check errors, bounded concurrency, cancellation, and logging safety. For
   workers, check acknowledgements, retries, and idempotency; for long-running
   services, check readiness and shutdown behavior.
6. Run focused checks for changed behavior and repository-required verification.
   Report actual results and any checks not run.

## Resources

- Read [references/examples.md](references/examples.md) when implementing
  external calls, streams, buffers, timers, or shutdown.
- Consult the official Node.js links in
  [references/additional-best-practices.md](references/additional-best-practices.md)
  when API behavior is ambiguous or version-sensitive.

## Boundaries

- Repository instructions and explicit task requirements take precedence over
  generic recommendations. Preserve security, validation, delivery guarantees,
  and compatibility contracts.
- Do not introduce infrastructure, architectural layers, or frameworks merely
  to match an example in this skill.
- Prefer Node.js, TypeScript, and installed dependencies when they clearly
  provide the required behavior.
