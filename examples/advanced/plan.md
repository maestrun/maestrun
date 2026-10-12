# Advanced sample: automatic QA repair and integration

Run `maestrun sample advanced`. Git 2.38+ is required; the command initializes a repository only in the new sample directory.
Three tiny tasks use Implementation → Tests → QA → Review. The first two run in separate worktrees; the third waits for both integrations. The repair budget is five cycles; this demo intentionally needs one QA repair. QA requests a correction and the workflow automatically returns to Implementation, repeats Tests and QA, then continues through Review and Integration. Each parallel task edits only its own files so both integrate without an intentional conflict. The third task runs after both integrations; no manual recovery is expected.
Use only Node.js ES modules and built-in node:test/node:assert/strict. No dependencies, installs, servers, network or full-repository scans. Inspect only task files. Keep each stage short and return brief, truthful evidence. QA/Review inspect only the explicit criteria; do not invent extra scope.

## Tasks

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
