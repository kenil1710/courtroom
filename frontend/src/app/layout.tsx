import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two families, clearly distinct, and both chosen for the subject rather than
 * for taste.
 *
 * Newsreader carries the RECORD — case captions, judgments, headlines. It has
 * the editorial authority a written judgment wants and a real italic, which the
 * "A v B" caption of every case depends on.
 *
 * Public Sans carries the INTERFACE. It was drawn for public-sector services,
 * which is what a court is, and it has the tabular figures that a page full of
 * money and case numbers needs in order to be comparable down a column.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CourtRoom — on-chain small claims",
    template: "%s · CourtRoom",
  },
  description:
    "File a small claim against a wallet, post evidence, and let validators return a verdict. The money moves the moment the verdict does.",
  openGraph: {
    title: "CourtRoom — justice without lawyers",
    description:
      "An on-chain small claims court. Two parties file, validators judge, and the contract settles.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${publicSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
