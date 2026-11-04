/**
 * Global default cap for font scaling (DT-1). React 19 / RN 0.86 dropped `defaultProps` on function components, so the default
 * is applied by replacing RN's lazy `Text` / `TextInput` exports with thin wrappers. An explicit `maxFontSizeMultiplier` on an
 * element (e.g. LABEL_TEXT_CAP on tabs, chips, dock) wins over the default. Font scaling itself is never switched off.
 * Import this ONCE, before any screen renders (index.ts).
 */

import * as React from 'react';
import type * as ReactNative from 'react-native';

import { CONTENT_TEXT_CAP } from '../theme/textScale';

type Capped<P> = P & { maxFontSizeMultiplier?: number };

const SKIPPED_STATICS = new Set(['length', 'name', 'prototype', '$$typeof', 'render', 'displayName', 'arguments', 'caller']);

function withCap<P extends object>(Base: React.ComponentType<P>, name: string): React.ComponentType<P> {
  const Wrapped = (props: Capped<P>) =>
    React.createElement(Base, { ...props, maxFontSizeMultiplier: props.maxFontSizeMultiplier ?? CONTENT_TEXT_CAP } as P);
  Wrapped.displayName = name;
  // Keep the statics of RN's own component (TextInput.State.currentlyFocusedInput, propTypes, ...): keyboard and gesture libraries read them.
  // Copied with their descriptors so getters stay getters; the function's own bookkeeping properties are skipped.
  for (const key of Object.getOwnPropertyNames(Base)) {
    if (SKIPPED_STATICS.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(Base, key);
    if (descriptor) Object.defineProperty(Wrapped, key, descriptor);
  }
  return Wrapped as unknown as React.ComponentType<P>;
}

// require (not `import * as`): Babel's namespace interop would hand back a COPY, and the patch must hit the real module object.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RN = require('react-native') as typeof ReactNative;

const BaseText = RN.Text;
const BaseTextInput = RN.TextInput;
const CappedText = withCap(BaseText as React.ComponentType<ReactNative.TextProps>, 'Text');
const CappedTextInput = withCap(BaseTextInput as unknown as React.ComponentType<ReactNative.TextInputProps>, 'TextInput');

// `RN` is the module object; its Text / TextInput are getters, so replace them with plain data properties.
Object.defineProperty(RN, 'Text', { value: CappedText, configurable: true, enumerable: true, writable: true });
Object.defineProperty(RN, 'TextInput', { value: CappedTextInput, configurable: true, enumerable: true, writable: true });
