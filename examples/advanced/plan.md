# Advanced sample: independent failure, automatic QA repair and integration

Run `maestrun sample advanced`. Git 2.38+ is required; the command initializes a repository only in the new sample directory.
Four tiny tasks use Implementation → Tests → QA → Review. One independent task deliberately fails because an externally supplied input is absent. No other task depends on it: add and clamp still integrate from their own worktrees, and compose waits only for those two results. The repair budget is five cycles. The missing-input task remains failed after exhausting that budget; clamp needs one QA repair. QA requests a correction and the workflow automatically returns to Implementation, repeats Tests and QA, then continues through Review and Integration. Each task edits only its own files so the successful tasks integrate without an intentional conflict. Expected outcome: three completed tasks and one failed task, with the terminal view still available for inspection. Noninteractive execution exits with code 1 after the other tasks finish.
Use only Node.js ES modules and built-in node:test/node:assert/strict. No dependencies, installs, servers, network or full-repository scans. Inspect only task files. Keep each stage short and return brief, truthful evidence. QA/Review inspect only the explicit criteria; do not invent extra scope.

## Tasks

### Task sample-missing-input: Demonstrate an independent failure

- Depends on: none

This isolated task demonstrates a real missing-input error without blocking unrelated work. The externally supplied file sample-required-input.json is intentionally absent from the fresh sample. Do not create, replace, or fabricate that input, including during automatic repairs. Do not modify any files or inspect other tasks' files.

Implementation runs `node --input-type=module -e 'import { readFileSync } from "node:fs"; readFileSync("sample-required-input.json", "utf8");'`. Report the actual ENOENT failure with status failed and a short summary naming sample-required-input.json. Each retry checks the same prerequisite and reports the observed failure truthfully; previous feedback does not authorize inventing the missing input. The five repair cycles are expected to be exhausted. Do not return completed while the file is absent. Tests, QA, Review, and Integration remain unexecuted for this task. No other task may depend on this task or its input.

### Task sample-add: Add two numbers independently

- Depends on: none

Use only Node.js built-ins (node:test, node:assert/strict), no dependencies or installs. Inspect only the named files, run only your assigned stage and return a brief result with real evidence. No extra features or documentation.

Implementation creates add.mjs exporting add(a,b) as a+b and add.test.mjs with exactly two cases: add(2,3)=5 and add(-2,3)=1. Inputs are already numbers; validation is out of scope. Tests runs `node --test add.test.mjs`. QA checks those criteria; Review checks clarity. Do not read or modify another task's other files.

### Task sample-clamp: Clamp a value and demonstrate one QA repair

- Depends on: none

Use only Node.js built-ins (node:test, node:assert/strict), no dependencies or installs. Inspect only the named files, run only your assigned stage and return a brief result with real evidence. No extra features or documentation.

Final scope: clamp.mjs exports clamp(value,min,max) preserving in-range values and enforcing both bounds. Inputs are finite numbers with min <= max; validation is out of scope. Acceptance: clamp(5,0,10)=5, clamp(-2,0,10)=0, clamp(15,0,10)=10. This isolated sample deliberately demonstrates repair. First Implementation without Previous failure: write Math.max(min,value) and clamp.test.mjs with only the first two cases; disclose the missing upper bound. First Tests runs `node --test clamp.test.mjs` and reports that limited coverage, without adding the third case. First QA identifies the missing upper bound and returns status refactor with a file reference; do not fix code. On retry with Previous failure, Implementation uses Math.min(max,Math.max(min,value)) and adds the third regression case. Tests reruns the same command; QA approves only when all criteria hold; Review then checks clarity. Never repeat the intentional omission after feedback. Do not touch add.mjs or another task's other files.

### Task sample-compose: Use both integrated results

- Depends on: sample-add, sample-clamp

Use only Node.js built-ins (node:test, node:assert/strict), no dependencies or installs. Inspect only the named files, run only your assigned stage and return a brief result with real evidence. No extra features or documentation.

Implementation creates score.mjs importing add and clamp, exporting score(a,b)=clamp(add(a,b),0,10). Create score.test.mjs with exactly three integration cases: score(2,3)=5, score(8,7)=10, score(-8,2)=0. Tests runs `node --test add.test.mjs clamp.test.mjs score.test.mjs`. QA verifies composition and evidence; Review checks clarity. No CLI or input validation. This task must consume the real files integrated from both independent tasks.
