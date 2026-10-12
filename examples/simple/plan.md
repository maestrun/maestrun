# Simple sample: a tiny greeting

Run `maestrun sample`. Two sequential tasks, Implementation → Tests; planning is supplied.
Use only Node.js built-ins, no dependencies, servers, network or setup commands.
Keep each stage short: inspect only the named files, make the smallest change, run the named test and return a brief truthful result. Do not add features or documentation.

## Tasks

### Task simple-greeting: Create a greeting

- Depends on: none

Use only Node.js built-ins (node:test, node:assert/strict), no dependencies or installs. Inspect only the named files, run only your assigned stage and return a brief result with real evidence. No extra features or documentation.

Create greeting.mjs exporting greet(name), returning `Hello, ${name.trim()}!` for a nonempty string. Create greeting.test.mjs using node:test and node:assert/strict with exactly two cases: greet('Ana') is 'Hello, Ana!' and greet(' Bob ') is 'Hello, Bob!'. Implementation writes these two small files. Tests runs `node --test greeting.test.mjs`. Work only on this task and stage.

### Task simple-validation: Reject a blank name

- Depends on: simple-greeting

Use only Node.js built-ins (node:test, node:assert/strict), no dependencies or installs. Inspect only the named files, run only your assigned stage and return a brief result with real evidence. No extra features or documentation.

Extend greet to throw TypeError for an empty or whitespace-only string. Add exactly those two regression cases to greeting.test.mjs while preserving the previous cases. Tests runs `node --test greeting.test.mjs`. No other input types, CLI, packages or features are in scope. This demonstrates a dependent change and regression tests, without intentional failure.
