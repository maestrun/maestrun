# Sequential QA repair

Run `maestrun sample run`: three tasks, Implementation → Tests → QA → Review.
Planning is supplied; one repair cycle is enough to demonstrate QA → Implementation.
Use only named files and Node.js built-ins. No installs, network, repository scans,
extra features or documentation. Run only your stage; return a short JSON summary
with actual evidence. QA and Review reuse Tests evidence instead of rerunning tests.

## Tasks

### Task sample-add: Add two numbers

- Depends on: none

Implementation: create add.mjs exporting `add(a,b) => a+b` and add.test.mjs
with node:assert/strict checking `add(2,3) === 5`. Inputs are numbers.
Tests: run `node add.test.mjs` once. QA: check that criterion using test evidence.
Review: inspect only these two files for clarity.

### Task sample-clamp: Clamp a number and demonstrate QA refactor

- Depends on: sample-add

Final criterion: clamp.mjs exports `clamp(value,min,max)` enforcing both bounds.
Inputs are numbers with min <= max; no validation.
First Implementation: use `Math.max(min,value)` and create clamp.test.mjs with
node:assert/strict checking `clamp(-2,0,10) === 0`; disclose the omitted upper bound.
First Tests: run `node clamp.test.mjs` once; keep this intentional limited coverage.
First QA: report the missing upper bound in clamp.mjs with status refactor; do not edit.
Implementation after Previous failure: use `Math.min(max,Math.max(min,value))`
and add `clamp(15,0,10) === 10`. Never repeat the omission after feedback.
Tests reruns that file; QA approves both bounds using the evidence; Review checks clarity.

### Task sample-cli: Use both results

- Depends on: sample-clamp

Implementation: create score.mjs importing add and clamp and exporting
`score(a,b) => clamp(add(a,b),0,10)`. Create score.test.mjs with node:assert/strict
checking `score(8,7) === 10`. Use the real dependency files.
Tests: run `node score.test.mjs` once. QA: verify composition and test evidence.
Review: check clarity. No CLI, argument parsing or additional tests.
