import type { Metadata } from "next";
import { Cairo, IBM_Plex_Sans, Inter, Lato, Nunito, Playfair_Display, Poppins } from "next/font/google";

import "./globals.css";

// The brand site pairs Poppins headings with Nunito body copy; the rest are
// the alternatives a company can pick for its own cards.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nunito",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

// Arabic needs a face that actually carries the script.
const cairo = Cairo({
  subsets: ["latin", "arabic"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Contact cards", template: "%s | TBS" },
  description: "Share a contact card by link and save it to any phone.",
};

const FONTS = [poppins, nunito, inter, playfair, lato, plex, cairo]
  .map((f) => f.variable)
  .join(" ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={FONTS}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
