# Additional Node.js best practices

Use these patterns when relevant and supported by the project's Node.js version.
Repository instructions and existing runtime conventions take precedence; these
patterns do not require adding infrastructure or dependencies.

1. **Propagate cancellation and deadlines.** Accept an `AbortSignal` in I/O
   functions, use `AbortSignal.timeout()` for bounded external work, and pass
   the signal through supported clients. See [AbortSignal](https://nodejs.org/api/globals.html#class-abortsignal).
2. **Use promise-based filesystem APIs.** Prefer `node:fs/promises`, specify
   encodings or binary intent, and close file handles in `finally` blocks. See
   [File system](https://nodejs.org/api/fs.html).
3. **Preserve stream backpressure.** Use `stream.pipeline()` for connected
   streams and await writes instead of buffering unbounded input in memory. See
   [Stream](https://nodejs.org/api/stream.html#streampipeline).
4. **Consume large streams incrementally.** Prefer async iteration or streaming
   parsers over reading an entire request, attachment, or export into one
   string or buffer. See [Readable async iteration](https://nodejs.org/api/stream.html#readablesymbolasynciterator).
5. **Create buffers explicitly and safely.** Use `Buffer.from()` for existing
   data and `Buffer.alloc()` for initialized memory; use `allocUnsafe()` only
   with a documented, measured reason and complete overwrite before exposure.
   See [Buffer](https://nodejs.org/api/buffer.html#static-method-bufferallocsize-fill-encoding).
6. **Parse URLs with the URL API.** Use `URL` and `URLSearchParams`, validate
   protocol, host, and allowed paths, and never concatenate untrusted URL
   fragments into requests. See [URL](https://nodejs.org/api/url.html).
7. **Use cancellable promise timers.** Prefer `node:timers/promises` for async
   delays and intervals, pass an `AbortSignal`, and clear or abort recurring
   work during shutdown. See [Timers Promises API](https://nodejs.org/api/timers.html#timers-promises-api).
8. **Reuse outbound HTTP connections deliberately.** Reuse a configured client
   or `http.Agent` for repeated calls, bound its socket and idle settings, and
   destroy it during shutdown. See [`http.Agent`](https://nodejs.org/api/http.html#class-httpagent).
9. **Define package boundaries explicitly.** For reusable Node packages, use
   `package.json` `exports` (and `imports` for private aliases) to expose only
   supported entry points; include every compatibility path before introducing
   an exports map. See [Packages](https://nodejs.org/api/packages.html#package-entry-points).
10. **Measure event-loop health without guessing.** Use
    `perf_hooks.monitorEventLoopDelay()` for latency signals and
    `node:diagnostics_channel` for opt-in, low-overhead instrumentation; keep
    labels and messages free of secrets and high-cardinality data. See
    [Performance hooks](https://nodejs.org/api/perf_hooks.html) and
    [Diagnostics Channel](https://nodejs.org/api/diagnostics_channel.html).
