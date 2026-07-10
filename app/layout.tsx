import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bacon — Investment Research",
  description: "Multi-lens investment research. Convergence builds conviction — never a single indicator. A research and thinking tool, not an advisor.",
  applicationName: "Bacon",
  robots: { index: false, follow: false },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bacon",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EBE8E0" },
    { media: "(prefers-color-scheme: dark)", color: "#16140E" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Root layout wraps every route in the App Router, so this loads
            app-wide; the lint rule below is written for the Pages Router.
            React hoists the link to <head>; preconnect + parallel fetch beats
            the render-blocking CSS @import this replaced. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          precedence="default"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
