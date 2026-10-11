// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DeleteAccountSheet from "./DeleteAccountSheet";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DeleteAccountSheet", () => {
  it("stays disabled until DELETE is typed, then sends the confirmation and leaves", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<DeleteAccountSheet open onClose={vi.fn()} appStoreSubscriber={false} />);

    const button = screen.getByRole("button", { name: "Delete my account" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: "delete" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: "DELETE" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/welcome?deleted=1"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ confirm: "DELETE" });
  });

  it("warns App Store subscribers that Apple keeps billing", () => {
    render(<DeleteAccountSheet open onClose={vi.fn()} appStoreSubscriber />);
    expect(screen.getByText(/billed by Apple/)).toBeTruthy();
  });

  it("shows the server's reason when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "Account deletion isn't available right now." }), { status: 503 }))));
    render(<DeleteAccountSheet open onClose={vi.fn()} appStoreSubscriber={false} />);
    fireEvent.change(screen.getByLabelText(/Type DELETE/), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(await screen.findByText(/isn't available right now/)).toBeTruthy();
  });
});
