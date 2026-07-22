import type { Metadata, Viewport } from "next";
import { Cinzel, Albert_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const sans = Albert_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "HoshiHits — Card Shop ERP",
  description: "HoshiHits Card Shop — ERP + POS operating system for trading card games",
  manifest: "/manifest.json",
};

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
