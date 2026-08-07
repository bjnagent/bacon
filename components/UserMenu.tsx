"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, LogOut, KeyRound, ChevronDown, Gauge } from "lucide-react";

// Account lives in a small popover (not a nav tab): the signed-in email, a
// shortcut to change password, and sign out. Admins also get a way into the
// operator console — without it the only route is typing /admin from memory.
export default function UserMenu({
  email, onChangePassword, isAdmin = false,
}: { email: string; onChangePassword: () => void; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="pr-usermenu" ref={ref}>
      {open && (
        <div className="pr-usermenu-pop" role="menu">
          <div className="pr-usermenu-email">{email}</div>
          {isAdmin && (
            <Link className="pr-usermenu-item" role="menuitem" href="/admin" onClick={() => setOpen(false)}>
              <Gauge size={14} /> Operator console
            </Link>
          )}
          <button className="pr-usermenu-item" role="menuitem" onClick={() => { setOpen(false); onChangePassword(); }}><KeyRound size={14} /> Change password</button>
          <form action="/api/auth/signout" method="post"><button type="submit" className="pr-usermenu-item" role="menuitem"><LogOut size={14} /> Sign out</button></form>
        </div>
      )}
      <button className="pr-usermenu-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <User size={16} /><span className="pr-usermenu-name">{email}</span><ChevronDown size={14} className="pr-usermenu-chev" />
      </button>
    </div>
  );
}
