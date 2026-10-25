/**
 * JChat 3.0 — useKeyboardCover (web): how many px of the LAYOUT viewport the on-screen keyboard (or any browser UI) covers at the bottom,
 * for things that are pinned to the layout viewport — the modals (React Native's Modal paints in a fixed portal on <body>).
 *
 * It is the sibling of useVisualViewportInset, which measures against the bottom of <body>: public/index.html keeps <body> fitted to
 * the visual viewport, so that hook already answers 0 once the keyboard is up and the chat composer (inside <body>) needs no lift.
 * A fixed modal is NOT inside that fitted area: Safari keeps it anchored to the layout viewport and the keyboard paints over it, so the
 * cover is measured against window.innerHeight:  innerHeight − (visualViewport.height + visualViewport.offsetTop).
 * Chrome on Android resizes the layout viewport itself (`interactive-widget=resizes-content`): both heights shrink together, it stays 0.
 * Updated on the visual viewport's `resize` and `scroll`. Without window.visualViewport it stays 0.
 */

import { useEffect, useState } from 'react';

export function useKeyboardCover(): number {
  const [cover, setCover] = useState(0);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setCover(Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop))));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return cover;
}
