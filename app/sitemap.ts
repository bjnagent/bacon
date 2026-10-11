import type { MetadataRoute } from "next";
import { LEGAL_UPDATED, absoluteUrl } from "@/components/marketing/site";

// The public pages, as absolute URLs on NEXT_PUBLIC_SITE_URL. /welcome is the
// canonical landing page; "/" is the signed-in app and never indexable.
export default function sitemap(): MetadataRoute.Sitemap {
  const legalUpdated = new Date(`${LEGAL_UPDATED}T00:00:00Z`);
  return [
    { url: absoluteUrl("/welcome"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pricing"), changeFrequency: "monthly", priority: 0.9 },
    // The house record changes every trading day.
    { url: absoluteUrl("/record"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/legal/terms"), lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/legal/privacy"), lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/legal/disclaimer"), lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
