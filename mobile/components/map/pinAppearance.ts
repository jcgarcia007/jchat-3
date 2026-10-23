/**
 * JChat 3.0 — what the map pin and the business card share about a venue's look: the colour of its initials circle
 * (one per venue, stable: utils/mapPin.ts colorIndex) and the icon of its category. Tokens only.
 */

import { IconCoffee, IconGlass, IconMapPin, IconMusic, IconToolsKitchen2 } from '@tabler/icons-react-native';
import { palette } from '../../theme/tokens';
import { colorIndex, type PinCategory } from '../../utils/mapPin';

/** Fill of the circle when there is no logo: one per venue, stable. */
export const INITIALS_COLORS = [palette.brandFill, palette.brandPurple, palette.success, palette.gold, palette.brandArtCoral] as const;

/** The stable initials colour of a venue. */
export function initialsColor(businessId: string): string {
  return INITIALS_COLORS[colorIndex(businessId, INITIALS_COLORS.length)];
}

export const CATEGORY_ICONS: Record<PinCategory, typeof IconMapPin> = {
  bar: IconGlass,
  restaurant: IconToolsKitchen2,
  cafe: IconCoffee,
  club: IconMusic,
  other: IconMapPin,
};
