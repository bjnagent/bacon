import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/SiteChrome";

// Terms, Privacy and Disclaimer share the public site's header and footer.
// They must stay reachable without signing in (proxy.ts lists /legal/ as
// public): the App Store and payment providers link to them directly.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <MarketingShell current="legal">{children}</MarketingShell>;
}
