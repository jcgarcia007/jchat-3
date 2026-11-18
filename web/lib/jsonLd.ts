// JSON-LD for the public pages (H-001). The text goes inside <script type="application/ld+json"> through dangerouslySetInnerHTML, and JSON.stringify
// does not escape "<", ">" or "&": a venue name holding the closing script tag would end the element and what follows would be parsed as HTML.
// safeJsonLd writes those characters (and U+2028 / U+2029, which older parsers treat as line breaks) as backslash + "u" + four hex digits, which is
// still valid JSON and parses back to the same value. The source avoids literal escape sequences on purpose: they are built from char codes.

import { SITE_ORIGIN } from "./appLinks";

const BACKSLASH = String.fromCharCode(92);
const UNSAFE = new RegExp("[<>&" + String.fromCharCode(0x2028, 0x2029) + "]", "g");

export function safeJsonLd(value: unknown): string {
  const json = JSON.stringify(value) ?? "null";
  return json.replace(UNSAFE, (ch) => BACKSLASH + "u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}

export interface LocalBusinessJsonLdInput {
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  cover_url: string | null;
}

export function localBusinessJsonLd(biz: LocalBusinessJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: biz.name,
    description: biz.description ?? undefined,
    address: biz.address ? { "@type": "PostalAddress", streetAddress: biz.address } : undefined,
    image: biz.cover_url ?? undefined,
    url: `${SITE_ORIGIN}/b/${biz.slug}`,
  };
}
