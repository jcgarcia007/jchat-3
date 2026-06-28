-- Migration 030: add menu_card_effect to businesses
-- Lets owners pick which hover animation applies to their public menu cards.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS menu_card_effect text NOT NULL DEFAULT 'lift'
    CHECK (menu_card_effect IN (
      'lift','reveal','tilt','spotlight','duotone',
      'glass','shine','focus','neon','polaroid'
    ));
