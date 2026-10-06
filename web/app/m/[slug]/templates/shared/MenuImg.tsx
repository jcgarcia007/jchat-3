"use client";

import { createContext, useContext, useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * Image for the public menu templates. A menu can hold dozens of full-size photos, so by default every image is
 * lazy + async-decoded; only the first few images rendered on the page (the ones at the top, in DOM order)
 * load eagerly with fetchpriority="high". Explicit props on the <img> always win.
 */
const PRIORITY_IMAGES = 3;

const MenuImgContext = createContext<{ rendered: number } | null>(null);

/** One counter per rendered menu (and per server request), so the "first images" are counted per page. */
export function MenuImgProvider({ children }: { children: ReactNode }) {
  const [counter] = useState(() => ({ rendered: 0 }));
  return <MenuImgContext.Provider value={counter}>{children}</MenuImgContext.Provider>;
}

export default function MenuImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const counter = useContext(MenuImgContext);
  const [rank] = useState(() => (counter ? counter.rendered++ : PRIORITY_IMAGES));
  const priority = rank < PRIORITY_IMAGES;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      {...props}
    />
  );
}
