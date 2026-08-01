import type { Metadata, Viewport } from "next";
import { createHash } from "crypto";
import { Cinzel, Albert_Sans, Spline_Sans_Mono } from "next/font/google";
import { getDb } from "@/lib/db";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const sans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

/**
 * Icon URLs carry a short hash of the current logo, so when the logo changes in
 * Settings the URL changes too — that forces browsers to refetch the tab icon
 * instead of showing the cached old one (the usual "my new icon won't update").
 */
export function generateMetadata(): Metadata {
  let v = "0";
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key='logo'").get() as { value?: string } | undefined;
    if (row?.value) v = createHash("sha1").update(row.value).digest("hex").slice(0, 12);
  } catch { /* DB not ready — fall back to the default version */ }
  const icon = `/api/icon?v=${v}`;
  return {
    title: "HoshiHits — Card Shop ERP",
    description: "HoshiHits Card Shop — ERP + POS operating system for trading card games",
    manifest: "/manifest.json",
    icons: {
      icon: [{ url: icon }, { url: "/icon.svg", type: "image/svg+xml" }],
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
