/**
 * JChat 3.0 — useVisualViewportInset (web): the height the on-screen keyboard (or any browser UI) takes from the
 * bottom of the page, to lift the chat input above it.
 *
 * Safari on iOS does NOT shrink the layout viewport when the keyboard opens: only the VISUAL viewport shrinks,
 * and the input would end up under the keyboard. So the inset is how much of the layout viewport the visual one
 * no longer covers at the bottom:  window.innerHeight − (visualViewport.height + visualViewport.offsetTop).
 * Chrome on Android resizes the layout viewport itself (index.html sets `interactive-widget=resizes-content`),
 * so there both heights shrink together and the inset stays 0 — no double correction.
 * Updated on the visual viewport's `resize` and `scroll` events (iOS scrolls the visual viewport when the
 * keyboard opens). Without window.visualViewport (old browsers) it stays 0.
 */

import { useEffect, useState } from 'react';

export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!viewport) return undefined;
    const update = () => {
      setInset(Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop))));
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
