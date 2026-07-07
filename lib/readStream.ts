"use client";

// Client helper: POST and read a text stream, invoking onChunk with the
// accumulated text as it grows. Non-OK responses are surfaced as readable
// errors (JSON body or gateway text) instead of being fed to a stream reader.
export async function readTextStream(
  url: string,
  body: unknown,
  onChunk: (accumulated: string) => void
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = `Request failed (${res.status})`;
    try { msg = String(JSON.parse(text).error || msg); } catch { if (res.status === 504 || /timeout/i.test(text)) msg = "The request hit the serverless time limit — try again"; }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
    onChunk(acc);
  }
  return acc;
}
