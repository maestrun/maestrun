# Orchestrator: small task tree

Six tasks, eleven worker stages, no repairs. Use only the named files and Node.js
built-ins. No installs, network, repository scans or extra features. Inputs are
numbers; no validation. Return one short sentence of evidence per stage.
Review stages may use read-only commands (for example `cat`) on their named files.
Verify the formulas only; no test runs, edits or prior test evidence are required.
Press F for the flowchart, D for tasks / all steps, and V for horizontal / vertical.

## Tasks

### Task add: Add two numbers

- Depends on: none
- Steps: implementation, testing, review

Implementation: create add.mjs exporting `add(a,b) => a+b` and add.test.mjs using
node:assert/strict to assert `add(2,3) === 5`. Tests: run `node add.test.mjs` once.
Review: use a read-only command (`cat add.mjs`) to confirm `add(a,b) => a+b`. No edits or test runs.

### Task clamp: Clamp a number

- Depends on: add
- Parent: add
- Steps: implementation, review

Implementation: create clamp.mjs exporting `clamp(n) => Math.min(10,Math.max(0,n))`.
Review: use a read-only command (`cat clamp.mjs`) to confirm the bounds. No edits or test runs.

### Task clamp-test: Check both bounds

- Depends on: clamp
- Parent: clamp
- Steps: testing

Create clamp.test.mjs using node:assert/strict to assert `clamp(-1) === 0` and
`clamp(12) === 10`. Run `node clamp.test.mjs` once.

### Task score: Compose the functions

- Depends on: add, clamp-test
- Parent: add
- Steps: implementation, testing, review

Implementation: create score.mjs importing add and clamp and exporting `score(a,b) => clamp(add(a,b))`.
Tests: import score.mjs and assert `score(1,1) === 2` with Node.js, once.
Review: use a read-only command (`cat score.mjs`) to confirm the composition. No edits or test runs.

### Task score-test: Check the composition

- Depends on: score
- Parent: score
- Steps: testing

Create score.test.mjs using node:assert/strict to assert `score(8,7) === 10` and
`score(2,3) === 5`. Run `node score.test.mjs` once.

### Task review: Review the result

- Depends on: score-test
- Steps: review

Use the read-only command `cat add.mjs clamp.mjs score.mjs`. Confirm
`add(a,b) => a+b`, `clamp(n) => Math.min(10,Math.max(0,n))`, and
`score(a,b) => clamp(add(a,b))`. No edits, test runs or extra documentation.
No prior test evidence is required; report one sentence about these formulas.
