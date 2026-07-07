import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bacon — Opportunity Cockpit",
    short_name: "Bacon",
    description: "The system pieces together the market's signals every day and surfaces under-the-radar opportunities. A monitoring cockpit, not an advisor.",
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#EBE8E0",
    theme_color: "#EBE8E0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
