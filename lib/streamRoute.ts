// Server helper: turn an async text generator into a streamed plain-text
// Response. Perceived speed: the client renders words as they arrive instead
// of staring at a spinner for the full generation. onDone runs after the last
// chunk (e.g. persistence) — errors there never break the already-sent stream.
export function textStreamResponse(
  gen: AsyncGenerator<string>,
  // onDone receives `ok=false` when the stream errored mid-flight, so callers can
  // skip persisting a truncated result (a network blip at opportunity 3 of 5
  // must not save a half-brief with an error string baked into an item).
  onDone?: (full: string, ok: boolean) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let full = "";
  let ok = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        ok = false;
        controller.enqueue(encoder.encode(`\n\n[error: ${err instanceof Error ? err.message : "stream failed"}]`));
      } finally {
        try { await onDone?.(full, ok); } catch { /* persistence is best-effort */ }
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
