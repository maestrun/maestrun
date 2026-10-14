# Simple: sequential tasks

Run `maestrun sample`: two tasks, Implementation → Tests, no automatic repairs.
Planning is supplied. Use only the named files and Node.js built-ins. No installs,
network, repository scans, extra features or documentation. Run only your stage;
return a short JSON summary with actual evidence.

## Tasks

### Task simple-greeting: Create a greeting

- Depends on: none

Implementation: create greeting.mjs exporting `greet(name) => "Hello, " + name.trim() + "!"`.
Create greeting.test.mjs with node:assert/strict checking `greet(" Ana ") === "Hello, Ana!"`.
Tests: run `node greeting.test.mjs` once and report the result.

### Task simple-validation: Reject a blank name

- Depends on: simple-greeting

Implementation: make greet throw TypeError when `!name.trim()`; add one assertion
for `greet(" ")` throwing TypeError, keeping the greeting assertion.
Tests: run `node greeting.test.mjs` once. Inputs are strings; no other validation.
