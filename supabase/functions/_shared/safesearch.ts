/**
 * JChat 3.0 — Google Cloud Vision SafeSearch helpers shared by the photo-moderation Edge Functions
 * (moderate-match-photo, moderate-dm-photo). Extracted verbatim from moderate-match-photo: same calls, same rules.
 *
 * Nothing here logs or returns the API key; every failure is a sanitized Error.
 */

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const VISION_TIMEOUT_MS = 15_000;

export const LIKELIHOOD = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"] as const;
export type Likelihood = typeof LIKELIHOOD[number];

export interface SafeSearch {
  adult: Likelihood;
  racy: Likelihood;
  violence: Likelihood;
  medical: Likelihood;
  spoof: Likelihood;
}

export type Decision =
  | { status: "rejected"; reason: "auto_explicit" | "auto_violence" }
  | { status: "pending"; needsReview: true }
  | { status: "approved" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rank(value: unknown): number {
  const idx = LIKELIHOOD.indexOf(value as Likelihood);
  return idx < 0 ? 0 : idx;
}

function normalize(value: unknown): Likelihood {
  return LIKELIHOOD[rank(value)];
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Match photo rules (spec): returns the automatic decision for a SafeSearch result. */
export function decideMatchPhoto(s: SafeSearch): Decision {
  if (rank(s.adult) >= rank("LIKELY")) return { status: "rejected", reason: "auto_explicit" };
  if (s.violence === "VERY_LIKELY") return { status: "rejected", reason: "auto_violence" };
  if (s.adult === "POSSIBLE" || rank(s.racy) >= rank("LIKELY") || s.violence === "LIKELY") {
    return { status: "pending", needsReview: true };
  }
  return { status: "approved" };
}

/** Calls Vision SAFE_SEARCH_DETECTION. Throws a sanitized Error on any failure (never includes the key). */
export async function safeSearch(apiKey: string, imageBase64: string): Promise<SafeSearch> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        }],
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error("vision_unreachable");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`vision_http_${response.status}`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("vision_bad_json");
  }
  const first = isObject(json) && Array.isArray(json.responses) ? json.responses[0] : null;
  if (!isObject(first) || isObject(first.error)) throw new Error("vision_response_error");
  const annotation = first.safeSearchAnnotation;
  if (!isObject(annotation)) throw new Error("vision_no_annotation");

  return {
    adult: normalize(annotation.adult),
    racy: normalize(annotation.racy),
    violence: normalize(annotation.violence),
    medical: normalize(annotation.medical),
    spoof: normalize(annotation.spoof),
  };
}

/** Verdict for a photo sent in a DM (migration 214): the photo is never blocked at send time, only shown blurred. */
export type DmPhotoVerdict = "clear" | "blurred" | "rejected";

/**
 * DM photo rules: adult VERY_LIKELY → rejected (not shown to the receiver, urgent report);
 * adult LIKELY, or racy / violence LIKELY or VERY_LIKELY → blurred ("View anyway" + "Report");
 * everything else → clear. POSSIBLE in any category no longer blurs.
 */
export function decideDmPhoto(s: SafeSearch): DmPhotoVerdict {
  if (s.adult === "VERY_LIKELY") return "rejected";
  if (rank(s.adult) >= rank("LIKELY") || rank(s.racy) >= rank("LIKELY") || rank(s.violence) >= rank("LIKELY")) {
    return "blurred";
  }
  return "clear";
}
