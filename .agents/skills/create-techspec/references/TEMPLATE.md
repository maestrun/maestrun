# Technical specification

## Summary

[Briefly describe the solution's technical approach. Summarize the key architecture decisions and implementation strategy in one or two paragraphs.]

## System architecture

### Component view

[Briefly describe the main components and list every new or changed component:

- Component names and primary responsibilities
- Main relationships between components
- Data-flow overview]

## Implementation design

### Main interfaces

[If applicable, define the main service interfaces in the project's language and conventions, with no more than 20 lines per example:

```
ServiceName
  methodName(input) -> output
```

]

### Data models

If applicable, document **every** entity or contract using the pattern below: its own subsection, a field table, and a representative example in the project's adopted format. Variants, degradations, error envelopes, mappings, and fixed parameters need their own blocks as shown.

If JSON contracts exist between the backend and UI, they must be ready for display. [Complete the feature-specific context. Normalize source fields that are absent to `null` when that is the project convention.]

#### `[TypeName]` — [short description]

| Field     | Type     | Required | Description   |
| --------- | -------- | -------- | ------------- |
| `[field]` | `[type]` | yes/no   | [Description] |

```text
{
  "[field]": "[realistic value]"
}
```

[Repeat the pattern above for every main entity or contract: aggregate payload, input types, error types, and so on.]

> **[Variant/degradation (if applicable)]:** [Explain when it occurs and its effect on the payload.]

```text
{
  "[affected_section]": null
}
```

#### `[ErrorName]` — error envelope (if applicable)

| Code     | HTTP       | Meaning       |
| -------- | ---------- | ------------- |
| `[code]` | `[status]` | [Description] |

```text
{
  "error": {
    "code": "[code]",
    "message": "[message in the project's standard language]"
  }
}
```

#### [External source] → contract mapping (if applicable)

| Source ([API/source]) | Destination (contract) |
| --------------------- | ---------------------- |
| `[source_field]`      | `[destination_field]`  |

#### Fixed source parameters (if applicable)

| API            | Main parameters                    |
| -------------- | ---------------------------------- |
| **[API name]** | `[param1=value]`, `[param2=value]` |

[If applicable, document database schemas using the same pattern: subsection, table, and JSON or SQL example.]

### API endpoints (if applicable)

If the feature exposes or consumes an API, document **every** endpoint using the pattern below and cover all relevant scenarios: success, empty list, validation error, source failure, and partial degradation. Record non-obvious behavior in a blockquote (`>`). For payloads already documented in Data models, reference the existing example instead of duplicating it.

#### Overview

| Method           | Route        | Description         |
| ---------------- | ------------ | ------------------- |
| `[GET/POST/...]` | `[/api/...]` | [Brief description] |

---

#### `[METHOD] [/api/route]`

[Brief description of the endpoint's purpose.]

**Query parameters** (or **body** for POST/PUT/PATCH)

**Access and validation:** [Authentication, allowed roles/object ownership,
input validation and size limits, or a reason these do not apply.]

| Parameter | Type     | Default                | Rules                  |
| --------- | -------- | ---------------------- | ---------------------- |
| `[param]` | `[type]` | `[default value or —]` | [Validation and rules] |

**Responses**

| Status  | Body             | When                         |
| ------- | ---------------- | ---------------------------- |
| `[200]` | `[ResponseType]` | [Success condition]          |
| `[400]` | `[ErrorType]`    | [Validation-error condition] |
| `[502]` | `[ErrorType]`    | [Source-failure condition]   |

**Example — success**

```http
[METHOD] /api/route?param=value
```

```text
{
  "[field]": "[realistic value]"
}
```

**Example — [alternative scenario, such as no match]**

```http
[METHOD] /api/route?param=value
```

```text
{
  "[body]": []
}
```

> [Note about frontend/client behavior, if applicable.]

**Example — [error scenario]**

```http
[METHOD] /api/route
```

```text
{
  "error": {
    "code": "[code]",
    "message": "[message]"
  }
}
```

[Repeat the pattern above for each endpoint, separating them with `---`.]

---

## Integration points

[Include only when the feature requires external integrations:

- External services or APIs
- Authentication requirements
- Error-handling strategy
- Deadlines, cancellation, retry limits, and idempotency where applicable]

## Security and data boundaries

[Describe applicable trust boundaries, authorization, sensitive-data handling,
input/output validation, and existing controls to reuse. Mark inapplicable
items with reasons; do not invent controls or external integrations.]

## Rollout, compatibility, and recovery

[When applicable, specify schema/data migrations, existing-client compatibility,
deployment order, failure detection, rollback or forward recovery, and data-loss
constraints. Otherwise explain why no migration or rollout plan is needed.]

## Testing approach

Define the feature's applicable test strategy and give every case a stable identifier. Use `TU-*` for unit tests, `TI-*` for integration tests, and `E2E-*` for end-to-end tests. Link every case to the acceptance criteria (`CA-*`) it verifies. Mark any layer that does not fit the solution as not applicable.

[List actual validation commands, required tooling and test data, and configured
coverage targets. Provide a documented manual case when automation is not
appropriate. Ensure every CA-* has a verification method.]

### Unit tests (if applicable)

| ID    | Test case name   | Acceptance criteria | Expected result   |
| ----- | ---------------- | ------------------- | ----------------- |
| TU-01 | [test case name] | [CA-01]             | [expected result] |

[Detail the unit-test strategy:

- Main components to test
- Use mocks only for external services
- Critical test scenarios]

### Integration tests (if applicable)

| ID    | Test case name   | Acceptance criteria | Expected result   |
| ----- | ---------------- | ------------------- | ----------------- |
| TI-01 | [test case name] | [CA-01]             | [expected result] |

[If needed, detail:

- Components tested together
- Test-data requirements]

### E2E tests (if applicable)

| ID     | Test case name   | Acceptance criteria | Expected result   |
| ------ | ---------------- | ------------------- | ----------------- |
| E2E-01 | [test case name] | [CA-01]             | [expected result] |

[If needed, describe how to test the UI and its involved services using the browser tool available in the environment.]

## Development sequencing

### Build order

[Describe the implementation sequence:

1. First component/feature (why it is first)
2. Second component/feature (dependencies)
3. Remaining components
4. Integration and tests]

### Technical dependencies

[List blockers and technical dependencies:

- Required infrastructure
- External-service availability]

## Monitoring and observability

[Describe the monitoring approach using existing project infrastructure:

- Metrics or health checks to expose
- Key events to record and their levels]

## Technical considerations

### Key decisions

[Record key technical decisions:

- Selected approach and rationale
- Considered trade-offs
- Rejected alternatives and reasons]

### Known risks

[List technical risks:

- Potential challenges
- Mitigation approaches
- Areas needing research]

### AGENTS.md and rules compliance

[List applicable `AGENTS.md` and `.agents/rules/` files actually read; record
their absence when missing. Include constraints and justified deviations.]

### Skill compliance

[List only the project skills in `.agents/skills/` applicable to this specification.]

### Relevant and dependent files

[List relevant and dependent files.]
