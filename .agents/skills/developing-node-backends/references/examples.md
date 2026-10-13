# Node.js examples

Use these examples as patterns, adapting names and types to the owning capability.

## Cancellable external work

```ts
export async function fetchResource(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Upstream request failed: ${response.status}`);
  return response.json();
}

const signal = AbortSignal.timeout(5_000);
await fetchResource(endpoint, signal);
```

Keep URL validation, response schemas, and safe error translation at the adapter boundary.

## Streaming with backpressure

```ts
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

await pipeline(
  createReadStream(inputPath),
  transformStream,
  createWriteStream(outputPath),
);
```

`pipeline` propagates completion and stream errors; do not manually queue unlimited chunks.

## Safe buffers and URLs

```ts
import { Buffer } from "node:buffer";

const payload = Buffer.from(encoded, "base64");
const scratch = Buffer.alloc(payload.byteLength);
const target = new URL(path, trustedOrigin);
if (target.protocol !== "https:") throw new Error("HTTPS is required");
```

Never use untrusted input as a filesystem path, module path, or unrestricted request target.

## Cancellable timer

```ts
import { setTimeout } from "node:timers/promises";

await setTimeout(retryDelayMs, undefined, { signal });
```

Treat an abort as a controlled cancellation and preserve its cause when translating errors.

## Explicit startup and shutdown

```ts
const app = createApp(config);
const server = app.listen(config.httpPort);

process.once("SIGTERM", () => {
  void closeGracefully({ server, timeoutMs: config.shutdownTimeoutMs });
});
```

Keep resource creation out of module import and make shutdown idempotent.
