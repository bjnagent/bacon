import type { MetadataRoute } from "next";
import { APP_SEGMENTS } from "@/lib/client/routes";
import { absoluteUrl } from "@/components/marketing/site";

// Crawl the public marketing pages; keep the signed-in app, the auth flow and
// the API out. App paths come from the shell's own route table, so a new app
// screen is excluded without anyone remembering to edit this file.
//
// (Disallow only stops crawling. The private pages also redirect signed-out
// visitors to /login, and the auth pages set `robots: noindex` themselves.)
export default function robots(): MetadataRoute.Robots {
  const appPaths = [...APP_SEGMENTS].filter(Boolean).map((seg) => `/${seg}`);
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/welcome", "/pricing", "/record", "/legal/"],
      disallow: ["/api/", "/login", "/onboarding", "/admin", "/offline", ...appPaths],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
