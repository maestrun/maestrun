# Three-task QA refactor sample

## Prompt

Build a tiny Node.js command-line calculator in exactly three dependent tasks:

1. Add two numbers, with unit tests.
2. Clamp a number between lower and upper bounds. Deliberately omit the upper bound in the first implementation so QA can identify a scope gap and request a refactor. Repair it once and add a regression test.
3. Connect addition and clamping in a CLI, with integration and E2E tests.

Use the configured built-in workflow: Implementation → Tests → QA → Review.
Tests runs the relevant unit, integration and/or E2E suites. QA reviews implementation scope against requirements and acceptance criteria using code and test evidence. Review checks code quality.

The intentional omission and limited initial test coverage apply only to task 2 in this isolated sample. The final code must satisfy the full scope. The expected second-task sequence is:

```text
Implementation → Tests → QA (yellow: needs changes)
      ↑                   │
      └───────────────────┘
Implementation → Tests → QA → Review
```

## Run

From your terminal:

```sh
maestrun sample run
```

Choose the executor, model and effort when prompted. That selection applies to all sample stages and does not change your saved project settings. The command creates a fresh directory under `.maestrun/samples/run-*`, writes this prompt and three-task plan, and runs the built-in workflow with your selection. Cancelling selection creates no sample and starts no tasks. Without a terminal, saved project assignments are used; missing built-in stages use the planning assignment. Planning is supplied here and is not rerun. The sample runs sequentially in the foreground; custom stages, plugins and target overrides are excluded from this built-in workflow demonstration.

The command invokes the selected model executor. Each invocation creates a new sample; existing project files and run progress are preserved. The terminal prints the sample path, where generated code, tests, conversations and `.maestrun/run.json` remain available afterward.

Select task 2 with ↓ and press F if the flowchart is hidden. QA stays yellow during repair, with an arrow back to Implementation; Tests and QA rerun after the repair. A terminal at least 97 columns wide shows the flowchart; 36 rows lets you see all four steps together. The completed interface remains open until Esc. To revisit a completed sample, change into its printed directory and run `maestrun run`; completed tasks are skipped.

To use this checked-in plan manually, build from the repository root, then validate its Markdown tasks before executing:

```sh
npm run build
cd examples/qa-refactor
node ../../dist/main.js init
node ../../dist/main.js run --dry-run
node ../../dist/main.js run --no-background
```

During setup, adjust the checked-in model assignments to models available to your account and keep Implementation, Tests, QA and Review enabled. This manual route writes generated files and run state into `examples/qa-refactor`; `maestrun sample run` creates a fresh project instead.

## Inspect the result

From the printed sample directory (or `examples/qa-refactor` for a manual run):

```sh
maestrun run --status
node --test add.test.mjs clamp.test.mjs cli.test.mjs
node cli.mjs 2 3
node cli.mjs 8 7
node cli.mjs -8 2
```

After successful completion, the CLI examples print `5`, `10` and `0`, respectively. In a source checkout without a global installation, use `node ../../dist/main.js run --status` from `examples/qa-refactor`.

Inspect `.maestrun/run.json` for the second task's `reruns` entry: it records the triggering QA stage, repair start time and justification. Task details show the same evidence. Model conversations are saved under `.maestrun/conversations/`; worker diagnostics are in `.maestrun/run.log`. A failed or cancelled sample can be resumed with `maestrun run` from its directory. Keep its checkpoint to avoid repeating completed steps.

## Runnable tasks

### Task sample-add: Add two numbers

- Depends on: none

Work only inside this sample project. Use Node.js ES modules (.mjs), node:assert/strict and node:test; no dependencies. Run only your assigned stage. Review checks code quality after QA approves scope. Return the structured status/summary result with real evidence. Implement add.mjs exporting add(a, b) for finite numbers. Acceptance: add(2,3)=5, add(-2,3)=1, add(0,0)=0. Implementation creates the function and add.test.mjs. Tests runs node --test add.test.mjs and reports results. QA reviews the implementation scope against these three cases and the finite-number contract; it does not replace the Tests stage. Review checks clarity and maintainability.

### Task sample-clamp: Clamp a number and demonstrate QA refactor

- Depends on: sample-add

Work only inside this sample project. Use Node.js ES modules (.mjs), node:assert/strict and node:test; no dependencies. Run only your assigned stage. Review checks code quality after QA approves scope. Return the structured status/summary result with real evidence. Final scope: clamp.mjs exports clamp(value,min,max) for finite numbers with min <= max, preserving in-range values and clamping both bounds. Acceptance: clamp(5,0,10)=5, clamp(-2,0,10)=0, clamp(15,0,10)=10. This task is an explicitly requested, isolated repair demonstration. First Implementation only, with no Previous failure: deliberately implement Math.max(min,value), omitting the upper-bound requirement, and create clamp.test.mjs covering in-range and below-min values. Disclose that omission in the summary. First Tests: run node --test add.test.mjs clamp.test.mjs, report the exact limited coverage and do not add the upper-bound case yet; this temporary coverage limit is part of the demonstration. First QA: review clamp.mjs against the full scope, identify the missing upper bound with a file reference and return status refactor; do not fix it or execute another stage. On retry with Previous failure: Implementation fixes clamp to Math.min(max,Math.max(min,value)) and adds the above-max regression case; never reintroduce the deliberate omission. Tests reruns both test files with the new regression. QA reviews that both bounds and all acceptance criteria are now implemented and returns completed only if the gap is resolved. Review then runs normally. Do not fake verification results or use a marker to claim a repair occurred.

### Task sample-cli: Connect and test the command-line workflow

- Depends on: sample-clamp

Work only inside this sample project. Use Node.js ES modules (.mjs), node:assert/strict and node:test; no dependencies. Run only your assigned stage. Review checks code quality after QA approves scope. Return the structured status/summary result with real evidence. Implement cli.mjs accepting exactly two finite numeric arguments, importing add and clamp, and printing clamp(add(a,b),0,10) followed by a newline. Missing or invalid inputs print a useful error to stderr and exit 1. Acceptance: node cli.mjs 2 3 prints 5; node cli.mjs 8 7 prints 10; node cli.mjs -8 2 prints 0; invalid text or missing arguments exits 1. Add cli.test.mjs with integration coverage for composing add and clamp and E2E coverage invoking the CLI with node:child_process. Tests runs node --test add.test.mjs clamp.test.mjs cli.test.mjs and reports unit, integration and E2E results. QA reviews the delivered CLI, input validation and test evidence against this exact scope and flags missing or extra features. Review checks maintainability. Do not add packages, servers or unrelated features.
