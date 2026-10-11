// /api/chat, with auth, metering and the model mocked. Lives beside the sheet
// (its only client) — the route file itself may only export handlers.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "@/app/api/chat/route";
import { requireUser } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { askStream } from "@/lib/anthropic";
import { withinQuota } from "@/lib/quota";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), requireUser: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ gate: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ askStream: vi.fn() }));
vi.mock("@/lib/quota", () => ({ withinQuota: vi.fn() }));
vi.mock("@/lib/log", () => ({ swallowed: vi.fn() }));

const USER = { id: "00000000-0000-4000-8000-000000000001", email: "a@b.c" };
const CONV = "6f1c1f0e-1d2a-4c55-9a43-2b1f7f3f9a10";
let inserted: Record<string, unknown>[] = [];
const refund = vi.fn(async () => {});

function sb() {
  return { from: vi.fn(() => ({ insert: vi.fn(async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null }; }) })) };
}

const post = (body: unknown) => POST(new Request("http://x/api/chat", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const ask = (messages: unknown[], extra: Record<string, unknown> = {}) => post({ messages, conversationId: CONV, ...extra });

async function* chunks(parts: string[], failAfter?: number) {
  for (let i = 0; i < parts.length; i++) {
    if (failAfter === i) throw new Error("upstream 529");
    yield parts[i];
  }
  if (failAfter === parts.length) throw new Error("upstream 529");
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  vi.mocked(requireUser).mockResolvedValue({ sb: sb() as never, user: USER });
  vi.mocked(withinQuota).mockResolvedValue(true);
  vi.mocked(gate).mockResolvedValue({ ok: true, state: {} as never, remaining: 9, refund });
});

describe("POST /api/chat", () => {
  it("passes the 401 through as JSON", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(NextResponse.json({ error: "Not signed in", code: "unauthenticated" }, { status: 401 }));
    const res = await ask([{ role: "user", content: "hi" }]);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("answers malformed requests with a JSON 400 and spends nothing", async () => {
    for (const res of [await post("not json"), await ask([]), await ask([{ role: "assistant", content: "only me" }])]) {
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toMatchObject({ code: "bad_request" });
    }
    expect(withinQuota).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
  });

  it("checks the daily cap before the monthly allowance", async () => {
    vi.mocked(withinQuota).mockResolvedValueOnce(false);
    const res = await ask([{ role: "user", content: "hi" }]);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(gate).not.toHaveBeenCalled();
  });

  it("returns the plan gate's 402 as-is, before calling the model", async () => {
    const upgrade = NextResponse.json({ error: "Over", code: "upgrade_required" }, { status: 402 });
    vi.mocked(gate).mockResolvedValueOnce({ ok: false, response: upgrade });
    const res = await ask([{ role: "user", content: "hi" }]);
    expect(res.status).toBe(402);
    expect(askStream).not.toHaveBeenCalled();
  });

  it("streams the reply and saves the completed exchange, in order", async () => {
    vi.mocked(askStream).mockReturnValueOnce(chunks(["Hello ", "there."]));
    const res = await ask(
      [{ role: "user", content: "first" }, { role: "assistant", content: "ok" }, { role: "user", content: "Hi?" }],
      { context: { kind: "asset", asset: "NVDA", evil: "x" } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-conversation-id")).toBe(CONV);
    expect(await res.text()).toBe("Hello there.");
    expect(gate).toHaveBeenCalledWith(expect.anything(), USER, "chat");
    expect(refund).not.toHaveBeenCalled();
    expect(inserted.map((r) => [r.role, r.content])).toEqual([["user", "Hi?"], ["assistant", "Hello there."]]);
    expect(inserted[0].context).toEqual({ kind: "asset", asset: "NVDA" });
    expect(inserted.every((r) => r.conversation_id === CONV && r.user_id === USER.id)).toBe(true);
    expect(String(inserted[0].created_at) <= String(inserted[1].created_at)).toBe(true);
  });

  it("mints a conversation id when the client's isn't a uuid", async () => {
    vi.mocked(askStream).mockReturnValueOnce(chunks(["x"]));
    const res = await post({ messages: [{ role: "user", content: "hi" }], conversationId: "nope" });
    await res.text();
    expect(res.headers.get("x-conversation-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-conversation-id")).not.toBe("nope");
  });

  it("refunds and saves nothing when the model fails before any text", async () => {
    vi.mocked(askStream).mockReturnValueOnce(chunks([], 0));
    const res = await ask([{ role: "user", content: "hi" }]);
    expect(await res.text()).toBe("\n\n[error: stream failed]");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual([]);
  });

  it("keeps the unit but saves nothing when the reply is cut off mid-way", async () => {
    vi.mocked(askStream).mockReturnValueOnce(chunks(["Half "], 1));
    const res = await ask([{ role: "user", content: "hi" }]);
    expect(await res.text()).toBe("Half \n\n[error: stream failed]");
    expect(refund).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("refunds when the client goes away before the first word, and stops the model", async () => {
    let release!: () => void;
    const finished = vi.fn();
    vi.mocked(askStream).mockReturnValueOnce((async function* () {
      try {
        await new Promise<void>((r) => { release = r; });
        yield "too late";
      } finally { finished(); }
    })());
    const res = await ask([{ role: "user", content: "hi" }]);
    const reader = res.body!.getReader();
    await reader.cancel();
    release();
    await vi.waitFor(() => expect(finished).toHaveBeenCalled());
    await vi.waitFor(() => expect(refund).toHaveBeenCalledTimes(1));
    expect(inserted).toEqual([]);
  });
});

describe("GET /api/chat", () => {
  function sbFor(latest: { conversation_id: string } | null, rowsNewestFirst: Record<string, unknown>[]) {
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain,
      limit: () => Object.assign(Promise.resolve({ data: rowsNewestFirst, error: null }), { maybeSingle: async () => ({ data: latest, error: null }) }),
    };
    return { from: () => chain };
  }

  it("returns the latest conversation oldest-first, opening on a question", async () => {
    const rows = [
      { role: "assistant", content: "a2", context: { kind: "asset", asset: "TSM" }, created_at: "2026-10-10T10:03:00Z" },
      { role: "user", content: "q2", context: null, created_at: "2026-10-10T10:02:00Z" },
      { role: "assistant", content: "a1", context: null, created_at: "2026-10-10T10:01:00Z" },
    ];
    vi.mocked(requireUser).mockResolvedValueOnce({ sb: sbFor({ conversation_id: CONV }, rows) as never, user: USER });
    const res = await GET();
    const d = await res.json();
    expect(d.conversationId).toBe(CONV);
    expect(d.messages).toEqual([{ role: "user", content: "q2" }, { role: "assistant", content: "a2" }]);
    expect(d.context).toEqual({ kind: "asset", asset: "TSM" });
    expect(d.updatedAt).toBe("2026-10-10T10:03:00Z");
  });

  it("says there's nothing to resume for a new account", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({ sb: sbFor(null, []) as never, user: USER });
    expect(await (await GET()).json()).toEqual({ conversationId: null, messages: [], context: null, updatedAt: null });
  });
});
