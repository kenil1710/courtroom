import type { Metadata, Viewport } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import "./globals.css";

/**
 * Two families, clearly distinct, and both chosen for the subject.
 *
 * Newsreader carries the RECORD — case captions, judgments, headlines, and the
 * filings themselves, which are set like the exhibits they are. It has the
 * editorial authority a written judgment wants and a real italic, which the
 * "A v B" caption of every case depends on.
 *
 * Public Sans carries the INTERFACE. It was drawn for public-sector services,
 * which is what a court is, and it has the tabular figures a page full of money
 * and case numbers needs to be comparable down a column.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
  metadataBase: new URL("https://courtroom-nine.vercel.app"),
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
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: "/apple-icon.png",
  },
};

/** The tab strip and the address bar take the court's own charcoal. */
export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is scoped to this ONE element and is the
    // documented escape hatch for an attribute deliberately set before
    // hydration. Without it React compares the `data-js` the script added
    // against the server's HTML and reports a mismatch on every page. It
    // suppresses nothing about this element's children.
    <html
      lang="en"
      className={`${newsreader.variable} ${publicSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          * Mark the document as scripted BEFORE first paint.
          *
          * The scroll reveals are CSS and their hidden state is gated on this
          * attribute. Without it the base state is VISIBLE, so a page whose
          * script never runs is still a readable page — and because it is set
          * here rather than in an effect, there is no flash of un-hidden
          * content before the reveals arm themselves.
          *
          * A DATA ATTRIBUTE, not a class. `className` on <html> is rendered by
          * React, so adding to it before hydration is a mismatch it reports on
          * every page; `data-js` is not in the JSX and is left alone.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.setAttribute('data-js','1')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
