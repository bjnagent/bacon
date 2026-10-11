// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ChatSheet from "./ChatSheet";
import { AppCtx, type AppApi } from "@/components/app/AppContext";
import { apiFetch, apiStream, ApiError } from "@/lib/client/api";
import { openPaywall } from "@/lib/client/paywall";
import type { ChatContext } from "@/lib/chatContext";

vi.mock("@/lib/client/api", async (orig) => {
  const real = await orig<typeof import("@/lib/client/api")>();
  return { ...real, apiFetch: vi.fn(), apiStream: vi.fn() };
});
vi.mock("@/lib/client/paywall", () => ({ openPaywall: vi.fn(), onPaywall: vi.fn(() => () => {}) }));

const NVDA: ChatContext = { kind: "asset", asset: "NVDA", title: "NVDA", sub: "multi-lens analysis" };
const GENERAL: ChatContext = { kind: "general", title: "Markets & research", sub: "open discussion" };

function app(over: Partial<AppApi> = {}): AppApi {
  return {
    remaining: () => null,
    refreshMe: vi.fn(async () => {}),
    me: null,
    ...over,
  } as unknown as AppApi;
}

function Shell({ value, children }: { value: AppApi; children: ReactNode }) {
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

function mount(props: { open?: boolean; context?: ChatContext | null } = {}, api = app()) {
  const onClose = vi.fn();
  const view = render(<Shell value={api}><ChatSheet open={props.open ?? true} context={props.context ?? NVDA} onClose={onClose} /></Shell>);
  const rerender = (p: { open: boolean; context: ChatContext | null }) =>
    view.rerender(<Shell value={api}><ChatSheet open={p.open} context={p.context} onClose={onClose} /></Shell>);
  return { ...view, onClose, rerender, api };
}

/** A controllable stream: push chunks, then finish or fail. */
function deferredStream() {
  let push!: (acc: string) => void;
  let finish!: (full: string) => void;
  let fail!: (e: unknown) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(apiStream).mockImplementationOnce((_url, _body, onChunk, sig) => {
    signal = sig;
    push = onChunk;
    return new Promise<string>((resolve, reject) => {
      finish = resolve;
      fail = reject;
      sig?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  return { push: (a: string) => act(() => push(a)), finish: (f: string) => act(async () => finish(f)), fail: (e: unknown) => act(async () => fail(e)), signal: () => signal };
}

const composer = () => screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;

beforeEach(() => {
  vi.mocked(apiFetch).mockResolvedValue({ conversationId: null, messages: [], context: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ChatSheet", () => {
  it("opens on the context with its starters and the disclaimer", async () => {
    mount();
    expect(screen.getByText("NVDA")).toBeTruthy();
    expect(screen.getByText("Multi-lens analysis")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ask about NVDA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What's the strongest bull and bear case?" })).toBeTruthy();
    expect(screen.getByText("Research, not investment advice.")).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/chat", { paywall: false }));
  });

  it("sends a starter with the context and conversation id, shows typing, then the streamed reply", async () => {
    const api = app({ remaining: () => 40 });
    mount({}, api);
    const s = deferredStream();
    fireEvent.click(screen.getByRole("button", { name: "What's the strongest bull and bear case?" }));

    const [url, body] = vi.mocked(apiStream).mock.calls[0];
    expect(url).toBe("/api/chat");
    const b = body as { messages: unknown[]; context: ChatContext; conversationId: string };
    expect(b.messages).toEqual([{ role: "user", content: "What's the strongest bull and bear case?" }]);
    expect(b.context).toEqual(NVDA);
    expect(b.conversationId).toMatch(/^[0-9a-f-]{36}$/);

    expect(screen.getByRole("status", { name: "Bacon is thinking" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    s.push("The **bull");
    expect(screen.queryByRole("status", { name: "Bacon is thinking" })).toBeNull();
    expect(document.querySelector("strong")?.textContent).toBe("bull");

    await s.finish("The **bull** case is demand.");
    expect(screen.getByText("bull").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeTruthy();
    // The reply spent a unit of the allowance: the count is refreshed.
    expect(api.refreshMe).toHaveBeenCalled();
  });

  it("strips the server's failure marker and offers a retry under a cut-off reply", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "Is it cheap?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(composer().value).toBe("");
    s.push("Partly.\n\n[error: stream failed]");
    await s.fail(new ApiError(502, { error: "The analysis was interrupted — please try again.", detail: "stream failed" }));

    expect(screen.getByText("Partly.")).toBeTruthy();
    expect(screen.queryByText(/\[error/)).toBeNull();
    expect(screen.getByText("The reply was cut off.")).toBeTruthy();

    // Retry asks again for the same question, without the partial reply.
    const again = deferredStream();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const body = vi.mocked(apiStream).mock.calls[1][1] as { messages: unknown[] };
    expect(body.messages).toEqual([{ role: "user", content: "Is it cheap?" }]);
    await again.finish("Not really.");
    expect(screen.getByText("Not really.")).toBeTruthy();
    expect(screen.queryByText("Partly.")).toBeNull();
    expect(screen.queryByText("The reply was cut off.")).toBeNull();
  });

  it("says the request failed (not cut off) when nothing came back", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await s.fail(new ApiError(0, { error: "offline", code: "offline" }));
    expect(screen.getByText("You're offline. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("stopping before the first word un-sends the message back into the composer", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "Long question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop" })); });
    expect(s.signal()?.aborted).toBe(true);
    await waitFor(() => expect(composer().value).toBe("Long question"));
    expect(screen.queryByText("Long question", { selector: "div" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Ask about NVDA" })).toBeTruthy();
  });

  it("stopping mid-reply keeps what arrived, marked as stopped", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "Go" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    s.push("Half an answer");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop" })); });
    await waitFor(() => expect(screen.getByText("Stopped")).toBeTruthy());
    expect(screen.getByText("Half an answer")).toBeTruthy();
    expect(composer().value).toBe("");
  });

  it("shows a friendly note with plans on a 402 (apiStream has already opened the paywall)", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "One more" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const body = { error: "You've used this month's allowance.", code: "upgrade_required", reason: "limit", meter: "chat", plan: "free", suggested: "pro", limit: 15, resetsAt: "2026-11-01T00:00:00.000Z" };
    await s.fail(new ApiError(402, body));
    expect(screen.getByText(/You've used all 15 chat messages for this month/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See plans" }));
    expect(openPaywall).toHaveBeenCalledWith(expect.objectContaining({ reason: "limit", meter: "chat" }));
  });

  it("shows the allowance when 5 or fewer messages are left", () => {
    mount({}, app({ remaining: () => 3, me: { plan: { plan: "free" } } as unknown as AppApi["me"] }));
    expect(screen.getByText("3 messages left this month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(openPaywall).toHaveBeenCalledWith({ reason: "browse" });
  });

  it("hides the allowance while there's plenty left", () => {
    mount({}, app({ remaining: () => 40 }));
    expect(screen.queryByText(/left this month/)).toBeNull();
  });

  it("offers the latest saved conversation and resumes it with its own context", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      conversationId: "6f1c1f0e-1d2a-4c55-9a43-2b1f7f3f9a10",
      messages: [{ role: "user", content: "Is TSM priced for perfection?" }, { role: "assistant", content: "Not quite." }],
      context: { kind: "asset", asset: "TSM", title: "TSM", sub: "multi-lens analysis" },
      updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    mount({ context: GENERAL });
    const resume = await screen.findByRole("button", { name: /Continue your last conversation/ });
    expect(resume.textContent).toContain("TSM · 2 messages · 2 days ago");

    fireEvent.click(resume);
    expect(screen.getByText("Is TSM priced for perfection?")).toBeTruthy();
    expect(screen.getByText("TSM")).toBeTruthy();

    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "And now?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const body = vi.mocked(apiStream).mock.calls[0][1] as { conversationId: string; messages: unknown[]; context: ChatContext };
    expect(body.conversationId).toBe("6f1c1f0e-1d2a-4c55-9a43-2b1f7f3f9a10");
    expect(body.context.asset).toBe("TSM");
    expect(body.messages).toHaveLength(3);
    await s.finish("Still fine.");
  });

  it("reopening on a different context starts a new conversation and keeps the old one resumable", async () => {
    const view = mount({ context: NVDA });
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "NVDA question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await s.finish("NVDA answer");
    const firstId = (vi.mocked(apiStream).mock.calls[0][1] as { conversationId: string }).conversationId;

    // Same context: the conversation continues.
    view.rerender({ open: false, context: NVDA });
    view.rerender({ open: true, context: { ...NVDA, notes: "fresh lens read" } });
    expect(screen.getByText("NVDA answer")).toBeTruthy();

    // A different name: a fresh conversation, with the NVDA one on offer.
    view.rerender({ open: false, context: NVDA });
    view.rerender({ open: true, context: { kind: "asset", asset: "AAPL", title: "AAPL", sub: "multi-lens analysis" } });
    expect(screen.queryByText("NVDA answer")).toBeNull();
    expect(screen.getByRole("heading", { name: "Ask about AAPL" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue your last conversation/ }).textContent).toContain("NVDA · 2 messages");

    const s2 = deferredStream();
    fireEvent.change(composer(), { target: { value: "AAPL question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const second = vi.mocked(apiStream).mock.calls[1][1] as { conversationId: string; messages: unknown[] };
    expect(second.conversationId).not.toBe(firstId);
    expect(second.messages).toEqual([{ role: "user", content: "AAPL question" }]);
    await s2.finish("AAPL answer");
  });

  it("New chat clears the thread and keeps it resumable", async () => {
    mount();
    const s = deferredStream();
    fireEvent.change(composer(), { target: { value: "Q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await s.finish("A");
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("A")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue your last conversation/ }));
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("Enter sends with a hardware keyboard; Shift+Enter doesn't", () => {
    const mm = vi.fn((q: string) => ({ matches: q.includes("pointer: fine"), media: q, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("matchMedia", mm);
    try {
      mount();
      deferredStream();
      fireEvent.change(composer(), { target: { value: "Line" } });
      fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
      expect(apiStream).not.toHaveBeenCalled();
      fireEvent.keyDown(composer(), { key: "Enter" });
      expect(apiStream).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("on a touch keyboard, Return is a newline and doesn't send", () => {
    mount();
    fireEvent.change(composer(), { target: { value: "Line" } });
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(apiStream).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    mount({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
