# Advanced: parallel tasks, failure, repair and on hold

Run `maestrun sample advanced` (Git 2.38+). Five tasks demonstrate parallel
worktrees, an independent failure, one QA repair, integration and user input.
Implementation → Tests → QA → Review; planning is supplied. One repair per task.
After answering `continue`: four completed tasks, one failed task, exit 1.
Use only named files and Node.js built-ins. No installs, network, repository scans,
extra features or documentation. Run only your stage; return a short JSON summary
with actual evidence. QA and Review reuse Tests evidence instead of rerunning tests.

## Tasks

### Task sample-missing-input: Demonstrate an independent failure

- Depends on: none

Implementation: run `node --input-type=module -e 'import { readFileSync } from "node:fs"; readFileSync("sample-required-input.json", "utf8");'`.
Report the real ENOENT with status failed, including on the single retry.
Never create the missing input or edit any files. Other stages remain unexecuted.
No other task depends on this task.

### Task sample-add: Add two numbers independently

- Depends on: none

Implementation: create add.mjs exporting `add(a,b) => a+b` and add.test.mjs
with node:assert/strict checking `add(2,3) === 5`. Inputs are numbers.
Tests: run `node add.test.mjs` once. QA: check that criterion using test evidence.
Review: inspect only these two files for clarity.

### Task sample-clamp: Clamp a value and demonstrate one QA repair

- Depends on: none

Final criterion: clamp.mjs exports `clamp(value,min,max)` enforcing both bounds.
Inputs are numbers with min <= max; no validation.
First Implementation: use `Math.max(min,value)` and create clamp.test.mjs with
node:assert/strict checking `clamp(-2,0,10) === 0`; disclose the omitted upper bound.
First Tests: run `node clamp.test.mjs` once; keep this intentional limited coverage.
First QA: report the missing upper bound in clamp.mjs with status refactor; do not edit.
Implementation after Previous failure: use `Math.min(max,Math.max(min,value))`
and add `clamp(15,0,10) === 10`. Never repeat the omission after feedback.
Tests reruns that file; QA approves both bounds using the evidence; Review checks clarity.

### Task sample-compose: Use both integrated results

- Depends on: sample-add, sample-clamp

Implementation: create score.mjs importing add and clamp and exporting
`score(a,b) => clamp(add(a,b),0,10)`. Create score.test.mjs with node:assert/strict
checking `score(8,7) === 10`. Use the real dependency files.
Tests: run `node score.test.mjs` once. QA: verify composition and test evidence.
Review: check clarity. No CLI, argument parsing or additional tests.

### Task sample-confirmation: Simulate waiting for approval

- Depends on: none

First Implementation: return `{"status":"on_hold","question":"Simulated approval: type continue to resume this task.","summary":"Waiting for your simulated PR approval. No real PR or login is required."}` without writing files.
Stay on hold until the recorded user answer is `continue` (case-insensitive).
Then write sample-confirmed.txt containing `confirmed` plus a newline.
Tests: run `node --input-type=module -e 'import { readFileSync } from "node:fs"; import assert from "node:assert/strict"; assert.equal(readFileSync("sample-confirmed.txt", "utf8"), "confirmed\n");'`.
QA/Review: verify the recorded answer and file; do not ask again.
No real PR, login, network calls or polling. Inspect only this task's file.
