"use client";

import { createContext, useContext, useId, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { MENU_PHOTO_THUMB_MAX, thumbUrlFor } from "@/lib/menuPhotos";

/**
 * Image for the public menu templates. A menu can hold dozens of full-size photos, so by default every image is
 * lazy + async-decoded; only the first few images rendered on the page (the ones at the top, in DOM order)
 * load eagerly with fetchpriority="high". Explicit props on the <img> always win.
 *
 * Photos uploaded through the dashboard have a ≤400 px `_thumb.webp` next to them: that is what loads first. If the
 * thumb does not exist (older photos) the original loads instead; if the image is displayed larger than the thumb can
 * serve sharply (a full-bleed hero), it upgrades itself to the full photo once. `variant="full"` skips the thumb.
 */
const PRIORITY_IMAGES = 3;

/**
 * One table per rendered menu (and per server request): useId of each image → its position among the first images.
 * Keyed by useId, not by a bare "rendered++" counter: React runs a render (and a useState initializer) twice in development
 * (StrictMode) and may re-render during hydration, and a counter then hands out 0, 2, 4… so the server HTML said
 * loading="eager" where the client said "lazy" (React's "tree hydrated but some attributes didn't match"). The same image always
 * gets the same rank, in the order the images are first rendered.
 */
const MenuImgContext = createContext<Map<string, number> | null>(null);

export function MenuImgProvider({ children }: { children: ReactNode }) {
  const [ranks] = useState(() => new Map<string, number>());
  return <MenuImgContext.Provider value={ranks}>{children}</MenuImgContext.Provider>;
}

export default function MenuImg({ variant = "auto", ...props }: ImgHTMLAttributes<HTMLImageElement> & { variant?: "auto" | "full" }) {
  const ranks = useContext(MenuImgContext);
  const id = useId();
  let rank = PRIORITY_IMAGES;
  if (ranks) {
    const known = ranks.get(id);
    if (known === undefined) ranks.set(id, ranks.size);
    rank = known ?? ranks.size - 1;
  }
  const [useFull, setUseFull] = useState(variant === "full");
  const priority = rank < PRIORITY_IMAGES;
  const original = typeof props.src === "string" ? props.src : undefined;
  const thumb = original && !useFull ? thumbUrlFor(original) : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      {...props}
      src={thumb ?? original}
      onError={(event) => {
        if (thumb) setUseFull(true); // no thumb for this photo: load the original
        else props.onError?.(event);
      }}
      onLoad={(event) => {
        const img = event.currentTarget;
        // Shown larger than the thumb can serve sharply → upgrade to the full photo.
        if (thumb && img.clientWidth * (window.devicePixelRatio || 1) > MENU_PHOTO_THUMB_MAX * 1.05) setUseFull(true);
        props.onLoad?.(event);
      }}
    />
  );
}
