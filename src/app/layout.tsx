import type { Metadata, Viewport } from "next";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Cinzel, Albert_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const sans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

/**
 * The tab / PWA icon is the HoshiHits raccoon mascot (public/icon.png) — a
 * square mark that stays recognizable at 16–32px, unlike the wide wordmark
 * (which stays the Settings logo, used on receipts and the app header).
 * The URL carries a short hash of the icon file so replacing it busts the
 * browser's favicon cache instead of showing the stale old one.
 */
export function generateMetadata(): Metadata {
  let v = "0";
  try {
    v = createHash("sha1").update(readFileSync(join(process.cwd(), "public", "icon.png"))).digest("hex").slice(0, 12);
  } catch { /* file missing — fall back to the default version */ }
  const icon = `/icon.png?v=${v}`;
  return {
    title: "HoshiHits — Card Shop ERP",
    description: "HoshiHits Card Shop — ERP + POS operating system for trading card games",
    manifest: "/manifest.json",
    icons: {
      icon: [{ url: icon, type: "image/png" }],
      apple: [{ url: icon }],
      shortcut: [{ url: icon }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#080808",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans min-h-screen">
        <div className="backdrop-stars" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
