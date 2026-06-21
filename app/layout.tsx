import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bacon — Investment Research",
  description: "Multi-lens investment research. Convergence builds conviction.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
