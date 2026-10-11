import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

// The display face, self-hosted by next/font: no third-party request, no
// render-blocking stylesheet, no layout shift. Body text uses the platform's
// own UI font (SF Pro on Apple devices), which costs nothing to load.
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-grotesk", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Bacon — your overnight research desk", template: "%s" },
  description: "Bacon sweeps the market overnight and hands you a short, ranked brief of ideas where independent signals agree — each with the condition that would kill it, and a public record of how its calls aged.",
  applicationName: "Bacon",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bacon" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", siteName: "Bacon", title: "Bacon — your overnight research desk", description: "A ranked morning brief of ideas where independent signals converge. It never invents a number, and it grades its own calls." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0D0B" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport for the on-screen keyboard so the
  // chat composer and sheets stay above it (iOS handles this in the native shell).
  interactiveWidget: "resizes-content",
};

// Runs before first paint: apply a pinned theme and flag the native shell, so
// neither flashes in after hydration.
const BOOT = `try{var t=localStorage.getItem("bacon-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())document.documentElement.classList.add("is-native")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
