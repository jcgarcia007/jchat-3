import type { MetadataRoute } from "next";

const BASE = "https://jchat.cloud";
const LEGAL_DATE = new Date("2026-09-21");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: LEGAL_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE}/terms`,
      lastModified: LEGAL_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE}/support`,
      lastModified: LEGAL_DATE,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
