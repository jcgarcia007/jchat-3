/**
 * THE one builder for an order line's `options` payload.
 *
 * The server prices a line by reading exactly this shape (payments EF →
 * priceLinesFromDb → resolveModifierCents + resolveGroupModifierCents):
 *
 *   { size?: string|null, extras?: string[], modifiers?: [{ g: groupId, c: [label] }] }
 *
 *   · size / extras  → legacy prices in menu_items.options.{sizes,extras}
 *   · modifiers      → prices in modifier_groups.choices, looked up by group id
 *
 * If a caller invents a different shape the server finds no modifiers and
 * UNDERCHARGES silently. So both the customer checkout (/m/[slug]) and the waiter
 * terminal build it here — one shape, one place.
 *
 * LEGACY GROUPS: the public menu turns legacy options.sizes/extras into synthetic
 * groups with the ids below so one UI can render both systems. Those ids are NOT
 * real modifier_groups rows, so sending them under `modifiers` would make the
 * server reject the line ("Modifier group not available"). They are mapped back to
 * size/extras here. (No item in the DB currently uses the legacy shape, so this is
 * defensive — but it is the difference between correct and silently wrong.)
 */

export const LEGACY_SIZE_GROUP_ID = "legacy-size";
export const LEGACY_EXTRAS_GROUP_ID = "legacy-extras";

export interface ChoiceLike {
  label: string;
}
export interface GroupSelectionLike {
  groupId: string;
  choices: ChoiceLike[];
}

/** Exactly what the payments EF expects for one line. */
export interface OrderLineOptions {
  size: string | null;
  extras: string[];
  modifiers: { g: string; c: string[] }[];
}

export function buildOrderOptions(input: {
  selectedSize?: ChoiceLike | null;
  selectedExtras?: ChoiceLike[];
  groupSelections?: GroupSelectionLike[];
}): OrderLineOptions {
  let size: string | null = input.selectedSize?.label ?? null;
  const extras: string[] = (input.selectedExtras ?? []).map((e) => e.label);
  const modifiers: { g: string; c: string[] }[] = [];

  for (const gs of input.groupSelections ?? []) {
    const labels = gs.choices.map((c) => c.label);
    if (labels.length === 0) continue;

    if (gs.groupId === LEGACY_SIZE_GROUP_ID) {
      // Legacy single-select size → options.size
      size = labels[0] ?? size;
    } else if (gs.groupId === LEGACY_EXTRAS_GROUP_ID) {
      // Legacy multi-select extras → options.extras
      extras.push(...labels);
    } else {
      // A real modifier_groups row → priced by group id
      modifiers.push({ g: gs.groupId, c: labels });
    }
  }

  return { size, extras, modifiers };
}

/** Short human summary of a line's selections, for order lists. */
export function summarizeOptions(opts: OrderLineOptions): string {
  const parts: string[] = [];
  if (opts.size) parts.push(opts.size);
  parts.push(...opts.extras);
  for (const m of opts.modifiers) parts.push(...m.c);
  return parts.join(", ");
}
