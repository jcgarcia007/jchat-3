/**
 * JChat 3.0 — native: nothing to do. The multiline TextInput of iOS / Android already starts one line tall, grows with the text and
 * scrolls past its maxHeight, so the composers spread an EMPTY fit (no style, no props) and render exactly as before.
 * The web version (useComposerFit.web.ts) gives the <textarea> the same behaviour.
 */

import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

import type { ComposerFit, ComposerFitOptions } from '../utils/composerFit';

const NOT_NEEDED: ComposerFit = { style: undefined, inputProps: {} };

export function useComposerFit(_ref: RefObject<TextInput | null>, _value: string, _options: ComposerFitOptions): ComposerFit {
  return NOT_NEEDED;
}
