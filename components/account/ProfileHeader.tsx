"use client";

import { Badge, Card } from "@/components/ui";
import type { MeState } from "@/components/app/AppContext";
import { planBadge } from "./plan";
import s from "./Account.module.css";

export default function ProfileHeader({ email, me }: { email: string; me: MeState | null }) {
  const initial = (email.trim()[0] ?? "?").toUpperCase();
  const badge = me ? planBadge(me) : null;
  return (
    <Card pad="lg">
      <div className={s.profile}>
        <span className={s.avatar} aria-hidden="true">{initial}</span>
        <div className={s.profileText}>
          <span className={s.email} title={email}>{email || "Signed in"}</span>
          {badge
            ? <Badge tone={badge.tone}>{badge.label}</Badge>
            : <span className="ui-skel" style={{ width: 96, height: 22, borderRadius: 999 }} aria-hidden="true" />}
        </div>
      </div>
    </Card>
  );
}
