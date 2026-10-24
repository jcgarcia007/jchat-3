/**
 * JChat 3.0 — web: the message box of the chat composers sizes itself like the native one (see utils/composerFit.ts).
 *
 * A multiline react-native-web TextInput is a <textarea>. Without `rows` the browser makes it 2 rows tall (58 px next to 44 px buttons)
 * and it never grows. So: `numberOfLines: 1` → rows="1"; the vertical padding is set so one line + borders = minHeight (the buttons'
 * height) with the 16 px font floor (utils/webInputFontFloor.web.ts) left alone; and after each change of the text the height is
 * recomputed from the content (height 'auto' → scrollHeight) and clamped to [minHeight, maxHeight], scrolling inside past the maximum.
 * The inline height is set on the DOM node because the style prop cannot know the content height; nothing else in the component does.
 */

import { useLayoutEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

import { composerHeight, composerPadding, type ComposerFit, type ComposerFitOptions } from '../utils/composerFit';

export function useComposerFit(ref: RefObject<TextInput | null>, value: string, options: ComposerFitOptions): ComposerFit {
  const { minHeight, maxHeight, lineHeight, borderWidth } = options;

  useLayoutEffect(() => {
    // On the web the ref of a TextInput is the <textarea> itself.
    const box = ref.current as unknown as HTMLTextAreaElement | null;
    if (!box || typeof box.scrollHeight !== 'number') return undefined;

    const fit = (): void => {
      box.style.height = 'auto'; // let the content decide, then clamp it
      const borders = box.offsetHeight - box.clientHeight;
      const { height, scrolls } = composerHeight(box.scrollHeight, borders, { minHeight, maxHeight });
      box.style.height = `${height}px`;
      box.style.overflowY = scrolls ? 'auto' : 'hidden';
    };
    fit();

    // The lines wrap differently when the width changes (rotation, the desktop column): refit then. The parent is observed, not the box,
    // so changing the box's own height never triggers it.
    const parent = box.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return undefined;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      fit();
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref, value, minHeight, maxHeight]);

  return useMemo<ComposerFit>(() => {
    const padding = composerPadding({ minHeight, lineHeight, borderWidth });
    return { style: { paddingTop: padding, paddingBottom: padding, minHeight }, inputProps: { numberOfLines: 1 } };
  }, [minHeight, lineHeight, borderWidth]);
}
