import type { MetadataRoute } from "next";

// Web app manifest for "Add to Home Screen" in browsers. (The App Store app is a
// separate native shell — capacitor.config.ts — and doesn't read this.)
// Colours are the light page background token (--bg in app/globals.css);
// browsers paint the launch splash and title bar with them.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bacon",
    short_name: "Bacon",
    description: "Your overnight research desk: a short, ranked morning brief of ideas where independent signals agree — each with the condition that would kill it. Research, not advice.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F6F4EF",
    theme_color: "#F6F4EF",
    categories: ["finance", "productivity", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
