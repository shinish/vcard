import type { Metadata } from "next";
import {
  Cairo,
  IBM_Plex_Sans,
  Inter,
  Lato,
  Nunito,
  Playfair_Display,
  Lora,
  Manrope,
  Montserrat,
  Oswald,
  Poppins,
  Quicksand,
  Raleway,
} from "next/font/google";

import "./globals.css";

// Inter dresses the admin. Poppins, Nunito and the rest are the type sets a
// company can pick for its own cards.
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

// The interface font, left variable: one file carries every weight the admin
// uses, from 400 in a table to 700 in a headline.
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

// The light end of Raleway, for a card that wants to read thin. Its 300 is
// genuinely light rather than a regular weight pretending.
const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-raleway",
  display: "swap",
});


const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
});

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
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

const FONTS = [poppins, nunito, inter, playfair, lato, raleway, plex, cairo, montserrat, lora, manrope, oswald, quicksand]
  .map((f) => f.variable)
  .join(" ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={FONTS}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
