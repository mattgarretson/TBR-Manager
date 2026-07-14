import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Plot Pile — Remember why you saved it",
    description:
      "A mobile-friendly TBR organizer for book titles, authors, unlimited tropes, covers, and the reason each book caught your eye.",
    openGraph: {
      title: "Plot Pile",
      description: "Your beautifully unhinged reading list, with receipts.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "Plot Pile — Remember why you wanted to read it." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Plot Pile",
      description: "Remember why you wanted to read it.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fraunces.variable}`}>{children}</body>
    </html>
  );
}
