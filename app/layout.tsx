import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bacon — Investment Research",
  description: "Multi-lens investment research. Convergence builds conviction — never a single indicator. A research and thinking tool, not an advisor.",
  applicationName: "Bacon",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#EE4310",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
