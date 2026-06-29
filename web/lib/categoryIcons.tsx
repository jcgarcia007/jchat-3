/**
 * Curated Tabler icon catalog for menu category icons.
 * All icon names verified to exist in the installed @tabler/icons-react version.
 * Backward-compatible: if `icon` is not a known key, callers fall back to
 * rendering `icon` as plain emoji text.
 */
import type { Icon as TablerIconType } from "@tabler/icons-react";
import {
  IconGlassCocktail,
  IconBeer,
  IconGlassFull,
  IconGlassChampagne,
  IconCoffee,
  IconMilk,
  IconBottle,
  IconBottleFilled,
  IconBeerFilled,
  IconGlassFilled,
  IconCup,
  IconGlass,
  IconLemon,
  IconMilkshake,
  IconDroplet,
  IconPizza,
  IconBurger,
  IconMeat,
  IconFish,
  IconSalad,
  IconCake,
  IconIceCream,
  IconIceCream2,
  IconBread,
  IconBaguette,
  IconEgg,
  IconEggs,
  IconSoup,
  IconBowl,
  IconCheese,
  IconCookie,
  IconCandy,
  IconChocolate,
  IconApple,
  IconCarrot,
  IconMushroom,
  IconLeaf,
  IconPlant,
  IconFlame,
  IconStar,
  IconSparkles,
  IconHeart,
  IconCrown,
  IconSausage,
  IconSalt,
  IconGrill,
  IconSnowflake,
  IconPepper,
  IconDumpling,
  IconMoodKid,
  IconChefHat,
  IconToolsKitchen2,
  IconCategory,
} from "@tabler/icons-react";

export type TablerIcon = typeof TablerIconType;

export interface CategoryIconEntry {
  name: string;
  label: string;
  Icon: TablerIcon;
}

export const CATEGORY_ICONS: CategoryIconEntry[] = [
  // ── Bebidas alcohólicas ──────────────────────────────────────────────────────
  { name: "cocktail",   label: "Cocktails",    Icon: IconGlassCocktail },
  { name: "beer",       label: "Cerveza",      Icon: IconBeer },
  { name: "beer_filled",label: "Cervezas",     Icon: IconBeerFilled },
  { name: "wine",       label: "Vinos",        Icon: IconGlassFull },
  { name: "champagne",  label: "Champagne",    Icon: IconGlassChampagne },
  { name: "spirits",    label: "Destilados",   Icon: IconBottleFilled },
  { name: "bottle",     label: "Botella",      Icon: IconBottle },
  // ── Bebidas sin alcohol ──────────────────────────────────────────────────────
  { name: "coffee",     label: "Café",         Icon: IconCoffee },
  { name: "milk",       label: "Lácteos",      Icon: IconMilk },
  { name: "milkshake",  label: "Malteadas",    Icon: IconMilkshake },
  { name: "juice",      label: "Jugos",        Icon: IconGlass },
  { name: "cup",        label: "Bebida",       Icon: IconCup },
  { name: "water",      label: "Agua",         Icon: IconDroplet },
  { name: "lemon",      label: "Limonadas",    Icon: IconLemon },
  // ── Comida principal ─────────────────────────────────────────────────────────
  { name: "pizza",      label: "Pizzas",       Icon: IconPizza },
  { name: "burger",     label: "Hamburguesas", Icon: IconBurger },
  { name: "meat",       label: "Carnes",       Icon: IconMeat },
  { name: "sausage",    label: "Embutidos",    Icon: IconSausage },
  { name: "grill",      label: "Parrilla",     Icon: IconGrill },
  { name: "fish",       label: "Pescados",     Icon: IconFish },
  { name: "dumpling",   label: "Dumplings",    Icon: IconDumpling },
  // ── Sopas & antojitos ────────────────────────────────────────────────────────
  { name: "soup",       label: "Sopas",        Icon: IconSoup },
  { name: "bowl",       label: "Bowl",         Icon: IconBowl },
  // ── Ensaladas & vegano ───────────────────────────────────────────────────────
  { name: "salad",      label: "Ensaladas",    Icon: IconSalad },
  { name: "leaf",       label: "Vegano",       Icon: IconLeaf },
  { name: "plant",      label: "Vegetariano",  Icon: IconPlant },
  { name: "carrot",     label: "Verduras",     Icon: IconCarrot },
  { name: "mushroom",   label: "Hongos",       Icon: IconMushroom },
  { name: "pepper",     label: "Picante",      Icon: IconPepper },
  // ── Pan & desayuno ───────────────────────────────────────────────────────────
  { name: "bread",      label: "Pan",          Icon: IconBread },
  { name: "baguette",   label: "Baguette",     Icon: IconBaguette },
  { name: "egg",        label: "Huevos",       Icon: IconEgg },
  { name: "eggs",       label: "Desayuno",     Icon: IconEggs },
  { name: "cheese",     label: "Quesos",       Icon: IconCheese },
  // ── Postres ──────────────────────────────────────────────────────────────────
  { name: "cake",       label: "Pasteles",     Icon: IconCake },
  { name: "ice_cream",  label: "Helados",      Icon: IconIceCream },
  { name: "ice_cream2", label: "Nieves",       Icon: IconIceCream2 },
  { name: "cookie",     label: "Galletas",     Icon: IconCookie },
  { name: "candy",      label: "Dulces",       Icon: IconCandy },
  { name: "chocolate",  label: "Chocolates",   Icon: IconChocolate },
  // ── Fruta ────────────────────────────────────────────────────────────────────
  { name: "apple",      label: "Frutas",       Icon: IconApple },
  // ── Especiales ───────────────────────────────────────────────────────────────
  { name: "spicy",      label: "Picante",      Icon: IconFlame },
  { name: "star",       label: "Especiales",   Icon: IconStar },
  { name: "new",        label: "Novedades",    Icon: IconSparkles },
  { name: "heart",      label: "Favoritos",    Icon: IconHeart },
  { name: "crown",      label: "Premium",      Icon: IconCrown },
  { name: "salt",       label: "Snacks",       Icon: IconSalt },
  { name: "frozen",     label: "Fríos",        Icon: IconSnowflake },
  // ── Niños & general ──────────────────────────────────────────────────────────
  { name: "kids",       label: "Niños",        Icon: IconMoodKid },
  { name: "chef",       label: "Chef",         Icon: IconChefHat },
  { name: "kitchen",    label: "Cocina",       Icon: IconToolsKitchen2 },
  { name: "category",   label: "General",      Icon: IconCategory },
];

export const CATEGORY_ICON_MAP: Record<string, TablerIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((i) => [i.name, i.Icon])
);

/**
 * Returns the Tabler icon component for a given name, or null if not found.
 * When null, callers should try rendering `name` as plain emoji text (backward compat).
 */
export function getCategoryIcon(name?: string | null): TablerIcon | null {
  if (!name) return null;
  return CATEGORY_ICON_MAP[name] ?? null;
}

/** Default fallback icon when neither a Tabler key nor emoji is available. */
export { IconToolsKitchen2 as CategoryFallbackIcon };
