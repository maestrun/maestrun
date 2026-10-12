# Contributing to Maestrun

Contributions are welcome: bug fixes, features, tests, documentation, and reproducible bug reports. Keep each pull request focused on one problem so it is easy to review.

## Before you start

Read the [README](README.md) and the relevant sections of the [advanced guide](docs/advanced.md). Check existing issues and pull requests for related work. For a substantial feature or breaking change, open an issue first to discuss the expected behavior and scope.

For bug reports, include the Maestrun version, Node.js version, operating system, reproduction steps, expected behavior, and actual behavior. Remove credentials and private project data from logs and configuration examples.

## Set up your environment

You need Git, npm, and a supported Node.js version. Use Node.js 24; the exact supported range is `^22.13.0 || ^24.0.0 || >=26.0.0`, as defined in `package.json`. Use Linux, macOS, or WSL. On Windows, install and run Node.js and npm inside WSL.

Fork the repository, then clone your fork and create a branch:

```sh
git clone <your-fork-url> maestrun-cli
cd maestrun-cli
git switch -c fix/describe-your-change
npm ci
```

Use npm and keep `package-lock.json` in sync when changing dependencies. The installation script checks platform and Node.js compatibility and creates `~/.maestrun` if needed.

Run the CLI directly from source:

```sh
npm run dev -- --help
```

The automated tests use fake executors and do not require paid model access. To manually test real planning or execution, install and authenticate a supported executor using the [README instructions](README.md). Real executor runs consume your account's usage; use a disposable project for these checks.

## Make your changes

The main directories are:

| Path                             | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `src/config/`                    | Configuration parsing and storage                                 |
| `src/contracts/`                 | Shared contracts and types                                        |
| `src/shared/`                    | Shared utilities and infrastructure                               |
| `src/modules/`                   | Capabilities such as workflow, planning, execution, and executors |
| `src/**/*.test.ts`               | Colocated unit tests                                              |
| `tests/integration/`             | Integration tests                                                 |
| `tests/helpers/`                 | Shared test helpers                                               |
| `docs/`, `examples/`, `plugins/` | User documentation, sample workflows, and plugins                 |

Use TypeScript and follow the surrounding code's conventions. Keep changes small, prefer existing utilities and platform features, and explain why any new dependency is necessary. Import a capability through its `index.ts` barrel from outside that capability; shared layers must not depend on capabilities. Architecture tests enforce these boundaries.

Add tests for new behavior and a regression test for a bug fix. Test observable outcomes and failure paths, keep tests deterministic, and fake external executor calls. Update documentation and examples when commands, configuration, or user-visible behavior change.

Do not commit generated output such as `dist/`, `coverage/`, or package archives, or local state such as `.maestrun/`, `.env` files, and credentials. Avoid unrelated reformatting and dependency updates.

## Validate before opening a pull request

Run these commands from the repository root for code or configuration changes:

```sh
npm run check
npm run test:coverage
npm run build
```

- `npm run check` checks formatting, ESLint, and TypeScript types.
- `npm run test:coverage` runs the unit and integration suites and enforces at least 80% coverage for lines, statements, functions, and branches.
- `npm run build` clears and rebuilds `dist/`, excluding tests.

During development, use `npm test` for the full suite without coverage, or pass a test file to run a focused check:

```sh
npm test -- tests/integration/config.test.ts
```

Format only the files you changed with the installed Prettier version:

```sh
npx prettier --write path/to/changed-file.ts
```

For documentation-only changes, check formatting for every changed Markdown file and verify links and command examples. For example:

```sh
npx prettier --check CONTRIBUTING.md
```

The `npm run format:check` command includes `README.md`, `CONTRIBUTING.md`, and `docs/`.

If your change affects installation or package contents, also run:

```sh
npm run release:pack
```

This runs checks and tests, builds the CLI, and creates a local `.tgz` package. It does not publish to npm. Publishing a release is not part of submitting a contribution.

For changes to terminal output or interactive prompts, manually exercise the affected flow and include a short transcript or screenshot in the PR. State the operating system, terminal, and executor used when relevant.

## Submit your pull request

Push your branch to your fork and open a pull request against the upstream repository's default branch. Use a clear title that describes the change, and write the description in English.

Include:

- The problem being solved and a related issue link, if one exists.
- A summary of the resulting behavior and any compatibility changes.
- Tests and manual checks performed, including their results.
- Documentation updates and screenshots or terminal output when relevant.
- Any remaining limitations or checks you could not complete, with the reason.

Before requesting review, inspect your diff, remove accidental files, and make sure the relevant checks pass. Use a draft PR if the work is incomplete. Respond to review feedback and rerun the affected checks after revisions.
