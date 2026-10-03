/**
 * JChat 3.0 — Fonts of the login "boleto": Fraunces 900 (title), Plus Jakarta Sans (text) and
 * IBM Plex Mono (labels). Loaded at runtime with expo-font (no native build needed). Each weight
 * is imported from its own subpath so only the used files are bundled.
 */

import { useFonts } from 'expo-font';
import { Fraunces_900Black } from '@expo-google-fonts/fraunces/900Black';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';

export const loginFont = {
  title: 'Fraunces_900Black',
  text: 'PlusJakartaSans_400Regular',
  textSemi: 'PlusJakartaSans_600SemiBold',
  textBold: 'PlusJakartaSans_700Bold',
  textXBold: 'PlusJakartaSans_800ExtraBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

/** True once every login font is ready (or failed: the screen then falls back to the system font). */
export function useLoginFonts(): boolean {
  const [loaded, error] = useFonts({
    Fraunces_900Black,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    IBMPlexMono_500Medium,
  });
  return loaded || error !== null;
}
