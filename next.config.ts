import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baseline security headers. Deliberately no strict CSP: we embed third-party
  // scripts (TradingView) and fonts; X-Frame-Options only restricts *our* pages
  // being framed, not the widgets we embed.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
