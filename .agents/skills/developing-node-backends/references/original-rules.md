# Backend engineering guidance

Apply these recommendations to affected Node.js or TypeScript backend paths.
Repository instructions take precedence. Frameworks, databases, brokers, package
managers, and deployment platforms are project choices, not skill requirements.

## Structure and configuration

- Follow existing module boundaries and public entry points. Keep transport
  handlers focused on validation, application calls, and response translation.
  Do not call one transport handler from another to reuse business logic.
- Use the project's configuration mechanism. Validate required values before
  accepting work and keep secrets out of committed files, fixtures, and logs.
  Use supported environment or secret loading without adding a loader needlessly.
- Keep resource creation and external side effects out of module import so
  tests can import code without starting listeners or connecting to services.
- Follow repository TypeScript settings. Validate external data at runtime
  rather than relying on type assertions.
- Prefer built-ins and installed dependencies. Use the project's package
  manager and maintain its lockfile when dependencies change.

## Async work and errors

- Await work that must complete before responding or acknowledging a job.
  Give background work an owner, rejection handling, and a shutdown policy.
- Handle stream, socket, server, and asynchronous event-handler errors through
  the APIs used by the project. Preserve stream backpressure.
- Throw Error instances and preserve useful causes when adding context. Keep
  transport status codes out of domain logic unless the existing contract
  requires them.
- Translate expected failures into documented, non-sensitive boundary results.
  Report unexpected failures through the project's error handling; do not
  silently discard them or expose internal stacks to clients.
- Bound external operations with deadlines and propagate cancellation where
  supported. Retry suitable failures with bounded attempts and delay; account
  for duplicate side effects before retrying writes.
- For queue workers, align acknowledgement timing with durable completion.
  Handle duplicate delivery, partial progress, and exhausted retries according
  to the broker and application's actual guarantees.
- Treat unknown fatal errors as a shutdown condition. Stop accepting work,
  drain or cancel owned operations within a deadline, close resources, and exit
  non-zero. Make cleanup idempotent and reuse it for termination signals.

## API and security boundaries

- Validate request parameters, payloads, job messages, and integration responses
  at boundaries. Bound payload sizes and allow only intended fields.
- Preserve documented success and error contracts. Update the existing API
  specification when a public interface changes.
- Enforce authentication and authorization at appropriate boundaries. Apply
  rate and concurrency limits to expensive or abuse-prone operations using
  existing framework or edge infrastructure.
- For HTTP services, configure headers, sessions, cross-origin access, and CSRF
  protections according to the authentication model. Use parameterized queries
  or safe database APIs instead of assembling queries from untrusted input.
- Avoid executing untrusted code or interpolating input into shell commands.
  When child processes are needed, prefer argument arrays without a shell;
  validate options as well as values passed to the executable.
- Validate filesystem paths and outbound destinations against the operation's
  allowed scope. Parsing a URL alone does not make it trusted.
- Keep credentials and sensitive payloads out of errors, telemetry, and logs.

## Performance and observability

- Avoid blocking the event loop on request or worker paths. Bound input sizes,
  concurrency, and buffering. Use streaming or worker threads when justified
  by the workload rather than adding infrastructure speculatively.
- In replicated services, avoid process-local memory for state that must
  survive restarts or be shared. Use existing persistence and coordination
  mechanisms according to durability requirements.
- Use the existing logging adapter and propagate request or job context across
  integrations. Add useful latency, error, queue, or resource metrics without
  sensitive or unbounded labels.
- When deployments use probes, distinguish process liveness from readiness to
  accept work. Reflect startup and shutdown in readiness.
- Follow the deployment platform's ownership of TLS, process supervision,
  scaling, and restarts without duplicating those responsibilities needlessly.

## Testing

- Test observable outcomes at public boundaries, with focused unit tests for
  logic and integration tests for adapter contracts.
- Cover affected success and failure paths, including validation, cancellation,
  timeouts, and partial progress when relevant. Worker changes should verify
  duplicate delivery and acknowledgement behavior.
- Keep tests independent of execution order, production services, and fixed
  ports. Create and clean up only resources owned by the test.
- Fake external services at integration boundaries for deterministic tests.
  Use isolated service instances when real protocol or persistence behavior
  needs verification.
- Use existing test tools and documented checks. Add regression coverage for
  corrected behavior and report actual commands and results.

## Deployment and containers

Apply this section only when deployment or container files are in scope.

- Respect the declared Node.js support range and align development, CI, and
  deployment versions. Avoid unrelated runtime upgrades.
- For containers, keep build-only tools out of the runtime image, follow the
  project's image-pinning policy, and run with least privilege.
- Ensure the service receives termination signals and has bounded shutdown.
  Match process and container memory limits to the deployment budget.
- Keep secrets out of build arguments and image layers; use runtime injection
  or build-time secret mounts when needed.
- Run repository-required dependency, image, and deployment checks relevant
  to the change before reporting readiness for release.
