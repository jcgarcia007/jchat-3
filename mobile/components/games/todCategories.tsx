/**
 * JChat 3.0 — Truth or Dare categories: one color and one icon each, from the design tokens (no loose hex).
 * The names and short descriptions live in the 'tod' i18n namespace (category.<key>.name / .desc).
 */

import type { ComponentType } from 'react';
import { IconCards, IconConfetti, IconMasksTheater, IconMoodHappy, IconStar } from '@tabler/icons-react-native';

import { palette } from '../../theme/tokens';
import type { TodCategory } from '../../services/tod';

export interface TodCategoryMeta {
  /** Accent / banner color of the category. */
  color: string;
  /** Text and icon color that stays legible on top of `color`. */
  onColor: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
}

export const TOD_CATEGORY_META: Record<TodCategory, TodCategoryMeta> = {
  classic: { color: palette.brand, onColor: palette.onBrand, Icon: IconCards },
  party: { color: palette.brandPurple, onColor: palette.onBrand, Icon: IconConfetti },
  laughs: { color: palette.warning, onColor: palette.textPrimaryLight, Icon: IconMoodHappy },
  confessions: { color: palette.gold, onColor: palette.onBrand, Icon: IconMasksTheater },
  talent: { color: palette.success, onColor: palette.onBrand, Icon: IconStar },
};
