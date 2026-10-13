# Folder structure

Use the repository's documented architecture, framework conventions, and
architecture checks as the source of truth. These guidelines do not prescribe
technology choices, directory names, or a single-repository, monorepo, or
multiple-repository layout. Preserve existing boundaries unless the task
explicitly calls for changing them.

## Repository boundaries

- Keep source, tests, configuration, and documentation with the application or
  package that owns them. Follow existing workspace and deployment boundaries.
- Do not split repositories, introduce packages, or copy sibling projects into
  the repository merely to match an example architecture.
- Create directories only when they contain required code, configuration,
  assets, or documentation. Avoid speculative scaffolding.
- Keep generated output, caches, dependencies, secrets, and local runtime state
  out of version control according to the repository's ignore policy.

## Application organization

- Place new behavior in its owning feature, capability, or module. Follow the
  existing naming and nesting conventions rather than introducing a competing
  layout for one change.
- Keep entry points focused on startup, input handling, and delegation. Put
  business logic in the existing application or domain modules and external
  integration details in the appropriate adapters.
- Keep configuration loading and validation in the established configuration
  location. Place shared contracts where their consumers can depend on them
  without importing application startup or integration side effects.
- Keep feature-specific types, assets, UI, and integration code near their
  owner. Extract shared code only when it has a clear responsibility used by
  multiple features; avoid miscellaneous utility collections.
- Split a module when its responsibilities become distinct, using the project's
  existing approach. Do not require flat directories, nested layers, or a
  fixed set of role suffixes for every project.

## Imports and public interfaces

- Respect module and package public entry points. Where the repository uses
  barrels or package exports, import through them from outside the boundary.
  Do not require barrels for projects that use another convention.
- Keep implementation details private according to the project's contracts;
  do not export every file automatically unless repository rules require it.
- Avoid circular dependencies. Shared foundations should not depend on the
  application features that consume them.
- Keep business behavior reusable without calling another transport handler.
  Use existing dependency boundaries rather than adding layers without need.

## Tests and supporting files

- Follow the repository's test layout, whether colocated or in dedicated test
  directories. Keep fixtures and helpers close to the tests that own them;
  share them only when multiple tests need the same support.
- Put integration and end-to-end tests with the package or suite responsible
  for those boundaries. Do not create a separate test repository by default.
- Keep documentation, examples, scripts, and agent guidance in their established
  locations. Update affected references and architecture checks when an
  authorized structural change moves files or changes module boundaries.

## Infrastructure and deployment

- Keep deployment definitions and infrastructure configuration with their
  documented owner, which may be this repository or an external project.
- Add container, proxy, database, messaging, or monitoring directories only
  when the project actually uses and owns that infrastructure.
- Follow existing build and deployment tooling; these guidelines do not require
  containers, an orchestration platform, a reverse proxy, or a monitoring stack.
