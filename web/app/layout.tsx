import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Inter, Playfair_Display, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { brandFromHost } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Board display fonts: Playfair Display (serif, editorial/luxury) + Space Grotesk.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Tab POS brand faces (Fraunces display + Inter body), self-hosted by next/font so
// the CSP font-src 'self' holds. Only used under data-brand="tabpos" (styles/brands/
// tabpos.css) → not preloaded, so jchat.cloud pages pay nothing for them.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "JChat 3.0 — Dashboard",
  description: "JChat business dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Brand by request host, resolved server-side (no window access → no hydration
  // mismatch). dashboard.tabpos.cloud → data-brand="tabpos"; jchat.cloud → no attribute.
  const brand = brandFromHost((await headers()).get("host"));

  return (
    <html
      lang={locale}
      data-theme="dark"
      data-brand={brand}
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${spaceGrotesk.variable} ${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
