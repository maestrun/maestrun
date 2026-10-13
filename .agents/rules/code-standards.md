# Code standards

These standards apply to application code in `backend`, `frontend`, and
`tests`. Architecture, security, and operational requirements remain in
`AGENTS.md`.

## General

- Prefer the smallest clear solution. Reuse platform features and existing
  code before adding abstractions or dependencies.
- Keep modules focused and dependencies explicit. Do not introduce circular
  imports, shared mutable state, or speculative extension points.
- Use descriptive English names. Use `PascalCase` for types and React
  components, `camelCase` for values and functions, and `UPPER_SNAKE_CASE` only
  for true constants.
- Remove dead code instead of commenting it out. Do not add comments unless
  they are necessary to explain behavior that clearer code cannot express.

## TypeScript

- Enable strict TypeScript checking. Do not use `any`; accept `unknown` at
  untrusted boundaries and narrow it through validation.
- Prefer immutable data and `const`. Avoid non-null assertions and unchecked
  type casts; fix or validate the underlying uncertainty instead.
- Keep functions small enough to have one purpose. Use early returns when they
  make control flow clearer.
- Handle every promise deliberately. Use `async`/`await` for sequential flows
  and bounded concurrency for parallel work.
- Export only what another module needs. Keep transport DTOs, queue contracts,
  domain types, and persistence models distinct when their shapes differ.

## Code patterns

### Avoid comments

Code must explain itself through names and small functions. Do not add comments
that narrate the implementation. A comment is acceptable only when it explains
an unavoidable, non-obvious constraint, such as a complex vendor regex.

Avoid:

```ts
// Check whether the alert is critical
if (alert.severity === "critical") {
  notifyOnCall(alert);
}
```

Prefer:

```ts
const isCriticalAlert = alert.severity === "critical";
if (isCriticalAlert) {
  notifyOnCall(alert);
}
```

Allowed when the constraint cannot be made clear in code:

```ts
// Accepts the vendor prefixes "Server:", "Server=", and "Server-".
const SERVER_FROM_SUBJECT =
  /(?:^|\s)server\s*[:=-]\s*(?<name>[a-z0-9][a-z0-9.-]*)/iu;
```

### Limit files, classes, and functions

Handwritten code files and classes must not exceed 150 physical lines. Methods
and functions, including their signatures and closing braces, must not exceed
30 physical lines. Split larger behavior by responsibility, not into arbitrary
numbered helpers.

Avoid:

```text
backend/src/modules/alerts/alert-service.ts (238 lines)
└── AlertService (211 lines)
    └── processEmail (74 lines)
```

Prefer:

```text
backend/src/modules/alerts/
├── process-email.ts (96 lines)
├── match-alert-rule.ts (72 lines)
└── create-halo-alert.ts (88 lines)
```

Each function remains focused and below 30 lines:

```ts
async function processEmail(job: EmailJob): Promise<ProcessingResult> {
  const email = validateEmail(job);
  const rule = await findMatchingRule(email);
  const server = await resolveServer(email, rule);
  return createAlert(email, rule, server);
}

async function findMatchingRule(email: Email): Promise<AlertRule> {
  const rule = await ruleRepository.findBySubject(email.subject);
  if (!rule) {
    throw new RuleNotFoundError(email.messageId);
  }
  return rule;
}
```

### Limit conditional depth and prefer guard clauses

Never nest `if`/`else` logic more than three levels or build chains with more
than three branches. Use guard clauses and early returns to keep the successful
path flat. When many values map to results, prefer a typed lookup over a long
conditional chain.

Avoid:

```ts
function canManageRule(user: User, rule: AlertRule): boolean {
  if (user.active) {
    if (user.permissions.includes("rules:write")) {
      if (rule.enabled) {
        if (!rule.locked) {
          return true;
        }
      }
    }
  }
  return false;
}
```

Prefer:

```ts
function canManageRule(user: User, rule: AlertRule): boolean {
  if (!user.active) {
    return false;
  }
  if (!user.permissions.includes("rules:write")) {
    return false;
  }
  if (!rule.enabled || rule.locked) {
    return false;
  }
  return true;
}
```

Prefer a lookup for a value mapping:

```ts
const PRIORITY_BY_SEVERITY: Record<Severity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

function priorityFor(severity: Severity): number {
  return PRIORITY_BY_SEVERITY[severity];
}
```

### Limit parameters

Functions and methods must accept no more than three parameters. When a
behavior genuinely needs more inputs, use one named parameter object so the
call site explains each value.

Avoid:

```ts
function createHaloAlert(
  companyId: string,
  serverId: string,
  summary: string,
  severity: Severity,
  category: string,
): Promise<HaloAlert> {
  return haloClient.createAlert({
    companyId,
    serverId,
    summary,
    severity,
    category,
  });
}
```

Prefer:

```ts
type CreateHaloAlertInput = {
  companyId: string;
  serverId: string;
  summary: string;
  severity: Severity;
  category: string;
};

function createHaloAlert(input: CreateHaloAlertInput): Promise<HaloAlert> {
  return haloClient.createAlert(input);
}
```

### Avoid blank lines inside functions

Do not place blank lines inside function or method bodies. Blank lines are
allowed between top-level functions and between class members.

Avoid:

```ts
function normalizeSubject(subject: string): string {
  const trimmedSubject = subject.trim();

  return trimmedSubject.toLowerCase();
}
```

Prefer:

```ts
function normalizeSubject(subject: string): string {
  const trimmedSubject = subject.trim();
  return trimmedSubject.toLowerCase();
}

function normalizeServerName(serverName: string): string {
  return serverName.trim().toLowerCase();
}
```

### Replace magic values with named constants

Extract unexplained domain numbers and strings into constants whose names state
their meaning. Literal values that are already self-explanatory, such as `0`,
`1`, or an empty string in an obvious local comparison, do not need constants.

Avoid:

```ts
if (attempts >= 5) {
  moveToQueue(message, "email.dead-letter.v1");
}
```

Prefer:

```ts
const MAX_EMAIL_PROCESSING_ATTEMPTS = 5;
const EMAIL_DEAD_LETTER_QUEUE = "email.dead-letter.v1";

if (attempts >= MAX_EMAIL_PROCESSING_ATTEMPTS) {
  moveToQueue(message, EMAIL_DEAD_LETTER_QUEUE);
}
```

### Declare variables close to use

Declare a variable immediately before the logic that needs it. Do not compute
values early when a guard clause may return before they are used.

Avoid:

```ts
function buildAlert(email: Email, rule?: AlertRule): Alert | undefined {
  const serverName = extractServerName(email);
  if (!rule) {
    return undefined;
  }
  return mapAlert(email, rule, serverName);
}
```

Prefer:

```ts
function buildAlert(email: Email, rule?: AlertRule): Alert | undefined {
  if (!rule) {
    return undefined;
  }
  const serverName = extractServerName(email);
  return mapAlert(email, rule, serverName);
}
```

### Keep secrets out of code

Never place API keys, passwords, tokens, connection strings, private keys, or
other sensitive values in source code, tests, fixtures, Dockerfiles, Compose
files, or committed configuration. Read them from environment variables. Keep
local values in an uncommitted `.env`; production must inject them from its
secret manager. `.env.example` documents variable names with empty or clearly
fake values only.

Avoid:

```ts
const HALO_API_KEY = "halo_live_abc123";
```

Prefer:

```ts
const haloApiKey = requiredEnv("HALO_API_KEY");
```

Local `.env`, never committed:

```dotenv
HALO_API_KEY=replace-with-a-local-sandbox-key
```

Committed `.env.example`:

```dotenv
HALO_API_KEY=
```

## Backend

- HTTP, SMTP, queue, and integration adapters validate and translate data, then
  call application services. They must not contain business rules.
- Pass dependencies into services explicitly and isolate MongoDB, RabbitMQ,
  LDAP, and Halo PSA access behind integration or repository modules.
- Represent expected failures with typed application errors and translate them
  once at the boundary. Never silently discard errors.
- Use structured logs with the shared correlation ID. Do not log secrets or raw
  email content.

## Frontend

- Use function components and hooks. Keep state local unless it is genuinely
  shared, and keep API access outside presentation components.
- Render accessible semantic HTML, associate labels with controls, support
  keyboard use, and expose loading, empty, and error states.
- Treat API data as untrusted and validate it at the client boundary when a bad
  payload could break or mislead the UI.

## Tests and checks

- Test observable behavior, boundary validation, and failure paths. Add a
  regression test with each bug fix.
- Keep unit tests deterministic and independent of network services, time, and
  shared state. Mock at external system boundaries rather than internal
  implementation details.
- Run formatting, linting, type checking, tests, and builds using the commands
  documented in `AGENTS.md` for every changed resource.
