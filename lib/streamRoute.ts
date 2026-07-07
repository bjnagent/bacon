// Server helper: turn an async text generator into a streamed plain-text
// Response. Perceived speed: the client renders words as they arrive instead
// of staring at a spinner for the full generation. onDone runs after the last
// chunk (e.g. persistence) — errors there never break the already-sent stream.
export function textStreamResponse(
  gen: AsyncGenerator<string>,
  onDone?: (full: string) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let full = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[error: ${err instanceof Error ? err.message : "stream failed"}]`));
      } finally {
        try { await onDone?.(full); } catch { /* persistence is best-effort */ }
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
