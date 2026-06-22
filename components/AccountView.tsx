"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Check } from "lucide-react";

// Account tab: show the signed-in email and let the user change their password.
export default function AccountView({ email }: { email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMsg(null);
    if (pw.length < 6) { setMsg({ ok: false, text: "Password must be at least 6 characters." }); return; }
    if (pw !== pw2) { setMsg({ ok: false, text: "Passwords don't match." }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const data = await res.json();
      if (res.ok) { setMsg({ ok: true, text: "Password updated." }); setPw(""); setPw2(""); }
      else setMsg({ ok: false, text: data.error || "Couldn't update password." });
    } catch { setMsg({ ok: false, text: "Couldn't update password." }); }
    finally { setSaving(false); }
  };

  return (
    <div className="pr-view">
      <div className="pr-hero">
        <div className="pr-hero-eyebrow">Account</div>
        <h1 className="pr-hero-title">Your account</h1>
      </div>

      <div className="pr-sec">
        <div className="pr-acct-field">
          <span className="pr-acct-label">Signed in as</span>
          <span className="pr-acct-val">{email}</span>
        </div>
      </div>

      <div className="pr-sec">
        <h2 className="pr-section-title">Change password</h2>
        <form onSubmit={submit} className="pr-acct-form">
          <input type="password" className="pr-acct-input" placeholder="New password (6+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={6} aria-label="New password" />
          <input type="password" className="pr-acct-input" placeholder="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={6} aria-label="Confirm new password" />
          <button className="pr-btn" type="submit" disabled={saving || !pw || !pw2}>{saving ? <><Loader2 size={15} className="pr-spin" /> Saving</> : "Update password"}</button>
          {msg && <span className={`pr-acct-msg ${msg.ok ? "is-ok" : "is-err"}`}>{msg.ok && <Check size={14} />}{msg.text}</span>}
        </form>
        <p className="pr-acct-note">You&apos;ll stay signed in. Use this to set a password if you first signed in with a magic link.</p>
      </div>
    </div>
  );
}
