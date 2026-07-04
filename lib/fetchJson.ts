// Client-side fetch → JSON with readable failures. Vercel's gateway answers
// function timeouts/crashes with a PLAIN-TEXT body ("An error occurred...");
// res.json() on that yields "Unexpected token 'A'..." soup. Parse defensively
// and turn known statuses into human messages instead.
export async function fetchJson(input: RequestInfo, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(input, init);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch {
    data = { error: res.status === 504 || /timeout/i.test(text)
      ? "The request hit the 60-second serverless limit — try again (repeat runs are usually faster)"
      : `Server returned a non-JSON error (${res.status}): ${text.slice(0, 80)}` };
  }
  return { ok: res.ok, status: res.status, data };
}
