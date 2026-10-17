# Orchestrator: agent-created task tree

Target: six tiny tasks, eleven worker stages and two coordination calls. No repairs.
Press F for the flowchart, D for tasks / all steps, and V for horizontal / vertical.

## Tasks

### Task objective: Build a bounded sum

- Depends on: none
- Steps: implementation

Coordinator: replace this unstarted objective with these six tasks. Use the exact
IDs, parents, dependencies and steps below. Put each row's scope into its task
instructions. After all pass, finish immediately without follow-up tasks.

| ID         | Parent | Depends on      | Steps                           | Scope                                                                                                                                                                                                  |
| ---------- | ------ | --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| add        | none   | none            | implementation, testing, review | Create add.mjs: `add(a,b) => a+b`. Create add.test.mjs asserting `add(2,3) === 5`; Tests runs it once. Review reads only add.mjs and confirms the formula.                                             |
| clamp      | add    | add             | implementation, review          | Implementation creates clamp.mjs: `clamp(n) => Math.min(10,Math.max(0,n))`. Review reads only clamp.mjs and confirms bounds.                                                                           |
| clamp-test | clamp  | clamp           | testing                         | Create and run clamp.test.mjs asserting `clamp(-1) === 0` and `clamp(12) === 10`.                                                                                                                      |
| score      | add    | add, clamp-test | implementation, testing, review | Implementation creates score.mjs importing add and clamp: `score(a,b) => clamp(add(a,b))`. Tests imports it and asserts `score(1,1) === 2` once. Review reads only score.mjs and confirms composition. |
| score-test | score  | score           | testing                         | Create and run score.test.mjs asserting `score(8,7) === 10` and `score(2,3) === 5`.                                                                                                                    |
| review     | none   | score-test      | review                          | Read add.mjs, clamp.mjs and score.mjs with `cat`; verify `a+b`, bounds 0..10 and `clamp(add(a,b))`. No edits or test runs.                                                                             |

All functions are named exports. Tests use node:assert/strict and run with `node`.
Inputs are numbers; no validation. Copy these constraints into every task: only
named files and Node.js built-ins; no installs, network, repository scans or extra
features; run only the assigned stage; return one short sentence of evidence.
For every review step, explicitly allow read-only commands such as `cat` on its
named files. Verify formulas only; do not run tests or edit files. No prior test
evidence is required.
Omit parentId for rows with Parent none. Keep task instructions concise.
