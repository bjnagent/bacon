"use client";

import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Callout, Sheet } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { DELETE_WORD, deleteConfirmed } from "./validation";
import s from "./Account.module.css";

/**
 * Account deletion (App Store Guideline 5.1.1(v): an app with sign-up must let
 * people delete their account from inside it). Typing a word, not tapping a
 * second button, because this is the one action here that can't be undone.
 */
export default function DeleteAccountSheet({ open, onClose, appStoreSubscriber }: {
  open: boolean;
  onClose: () => void;
  /** Their plan is billed by Apple, which we cannot cancel for them. */
  appStoreSubscriber: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Delete account" initialFocus="sheet">
      {open && <DeleteForm appStoreSubscriber={appStoreSubscriber} />}
    </Sheet>
  );
}

function DeleteForm({ appStoreSubscriber }: { appStoreSubscriber: boolean }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = deleteConfirmed(typed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      // The route re-checks the typed word, so a stray DELETE can't erase an account.
      await apiFetch<{ ok: true; appStore?: boolean }>("/api/account", { method: "DELETE", body: { confirm: DELETE_WORD }, paywall: false });
      // A full navigation, not navigate() or the router: the session is gone,
      // and every in-memory cache of this account's data must go with it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload is the point
      window.location.assign("/welcome?deleted=1");
    } catch (error) {
      setBusy(false);
      setErr(error instanceof Error ? error.message : "Couldn't delete your account — try again.");
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <p className={s.sheetIntro}>This permanently erases your Bacon account. It can&apos;t be undone.</p>
      <ul className={s.erased}>
        <li>Your watchlist, themes and tracked voices</li>
        <li>Every brief, deep dive and chat</li>
        <li>Your personal track record and settings</li>
        <li>Your sign-in — this email can sign up again as a new account</li>
      </ul>
      <Callout tone={appStoreSubscriber ? "warn" : "neutral"} icon={<TriangleAlert />}>
        {appStoreSubscriber
          ? <><strong>Your subscription is billed by Apple.</strong> Deleting your account doesn&apos;t cancel it — cancel in iOS Settings → your name → Subscriptions.</>
          : <>A subscription bought on the web is cancelled with your account. One bought in the iOS app is billed by Apple — cancel it in iOS Settings → your name → Subscriptions.</>}
      </Callout>
      <div className="ui-field">
        <label className="ui-label" htmlFor={`${id}-confirm`}>Type {DELETE_WORD} to confirm</label>
        <input
          id={`${id}-confirm`} className="ui-input" value={typed} onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
        />
      </div>
      {err && <Callout tone="neg">{err}</Callout>}
      <Button type="submit" variant="danger" size="lg" block disabled={!ready} loading={busy}>Delete my account</Button>
    </form>
  );
}
