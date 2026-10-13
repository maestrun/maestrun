# QA report — [Feature name]

Browser-tool evidence must be saved in `tasks/prd-[slug]/evidences/`.

Sanitize credentials, tokens, personal data, logs, and screenshots before saving.

## Summary

- Date: [date]
- Tested revision or working diff: [repository and commit / recorded diff]
- Environment/tooling: [isolated URLs, runner/browser, relevant versions]
- PenTest report revision: [tested revision and freshness assessment]
- PenTest status: PASSED / FAILED / BLOCKED
- QA status: APPROVED / FAILED / BLOCKED
- Total acceptance criteria: [X]
- Met acceptance criteria: [Y]
- Bugs found: [Z]

## Verified acceptance criteria

| ID    | Acceptance criterion | Test cases                            | Status                | Evidence                  |
| ----- | -------------------- | ------------------------------------- | --------------------- | ------------------------- |
| CA-01 | [description]        | [TU-01, TI-01, E2E-01 or manual case] | PASS / FAIL / BLOCKED | [sanitized evidence link] |

## Executed E2E tests

| ID     | Flow   | Result                                 | Notes                                                 |
| ------ | ------ | -------------------------------------- | ----------------------------------------------------- |
| E2E-01 | [flow] | PASS / FAIL / BLOCKED / NOT APPLICABLE | [steps, expected/actual behavior, evidence or reason] |

## Automated tests and coverage

| Layer                            | ID                 | Result                                 | Validation/command       | Notes                |
| -------------------------------- | ------------------ | -------------------------------------- | ------------------------ | -------------------- |
| Unit / Integration / Other check | [case or check ID] | PASS / FAIL / BLOCKED / NOT APPLICABLE | [actual project command] | [evidence or reason] |

- Coverage: [value, target, or NOT APPLICABLE]

## Accessibility

- [a11y checklist]

## Discovered and fixed bugs

| ID     | Description   | Severity            | Status          | Fix                          | Regression test | Evidence        |
| ------ | ------------- | ------------------- | --------------- | ---------------------------- | --------------- | --------------- |
| BUG-01 | [description] | High / Medium / Low | Fixed / Blocked | [fix or reason for blocking] | [test]          | [evidence link] |

## Conclusion

[Final QA decision]

[Identify remaining blockers, affected security cases retested after fixes, and
cleanup of this run's resources. Required unrun checks cannot support APPROVED.]
