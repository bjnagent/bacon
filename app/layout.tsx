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
  themeColor: "#EBE8E0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
