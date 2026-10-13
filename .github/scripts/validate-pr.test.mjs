import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validatePullRequest } from "./validate-pr.mjs";

const body = `## What this PR does
Preserves completed tasks when a workflow resumes.
## Changelog
- Fixed: Resumed workflows retain completed tasks.
## Breaking changes and migration
None
## Validation
| Check | Result | Evidence or reason |
| --- | --- | --- |
| npm test | PASS | All tests passed. |
## Limitations
None
## Readiness
- [x] Checks pass.
`;
const valid = { title: "Preserve completed tasks when resuming workflows", body, draft: false };

test("accepts release notes, internal notes, and CRLF descriptions", () => {
  assert.doesNotThrow(() => validatePullRequest(valid));
  assert.doesNotThrow(() =>
    validatePullRequest({
      ...valid,
      body: body.replace("Fixed:", "Internal:").replaceAll("\n", "\r\n"),
    }),
  );
});

for (const title of ["", "Fix bug", "Update files", "x".repeat(101)]) {
  test(`rejects invalid title: ${title.slice(0, 20)}`, () => {
    assert.throws(() => validatePullRequest({ ...valid, title }), /descriptive PR title/);
  });
}

test("rejects the unfilled repository template and missing body", () => {
  const template = readFileSync(new URL("../pull_request_template.md", import.meta.url), "utf8");
  assert.throws(() => validatePullRequest({ ...valid, body: template }), /required section/);
  assert.throws(() => validatePullRequest({ ...valid, body: null }), /required section/);
});

test("rejects missing, comment-only, placeholder, and duplicate sections", () => {
  for (const replacement of ["", "<!-- None -->", "TBD"]) {
    assert.throws(
      () => validatePullRequest({ ...valid, body: body.replace("None", replacement) }),
      /required section/,
    );
  }
  assert.throws(
    () => validatePullRequest({ ...valid, body: body.replace("## Changelog", "## Notes") }),
    /required section/,
  );
  assert.throws(
    () => validatePullRequest({ ...valid, body: body + "\n## Changelog\n- Fixed: Duplicate." }),
    /Duplicate section/,
  );
});

test("does not count instructional comments as changelog entries", () => {
  const note = "- Fixed: Resumed workflows retain completed tasks.";
  assert.throws(
    () => validatePullRequest({ ...valid, body: body.replace(note, `<!-- ${note} -->`) }),
    /required section/,
  );
  assert.throws(
    () => validatePullRequest({ ...valid, body: body.replace(note, "- Refactored files.") }),
    /Changelog needs/,
  );
});

test("requires validation evidence and recognized result", () => {
  assert.throws(
    () => validatePullRequest({ ...valid, body: body.replace("All tests passed.", "") }),
    /Validation needs/,
  );
  assert.throws(
    () => validatePullRequest({ ...valid, body: body.replace("PASS", "OK") }),
    /Validation needs/,
  );
});

test("allows incomplete checks only while draft", () => {
  for (const result of ["FAIL", "BLOCKED"]) {
    const incomplete = { ...valid, body: body.replace("PASS", result) };
    assert.throws(() => validatePullRequest(incomplete), /Keep the PR in draft/);
    assert.doesNotThrow(() => validatePullRequest({ ...incomplete, draft: true }));
  }
  const unchecked = { ...valid, body: body.replace("[x]", "[ ]") };
  assert.throws(() => validatePullRequest(unchecked), /readiness checklist/);
  assert.doesNotThrow(() => validatePullRequest({ ...unchecked, draft: true }));
});
