/**
 * JChat 3.0 — Menu Editor (Dashboard) · Task 3.1
 *
 * Full menu management for business owners:
 *  1. Category list with up/down reordering (updates `sort`).
 *     // TODO(dnd): drag-to-reorder — replace up/down buttons with a DnD lib.
 *  2. Create / edit category: name + emoji icon input.
 *     // TODO(Task 0.4): replace emoji <input> with full emoji/SF symbol selector.
 *  3. Publish / unpublish toggle per category.
 *  4. Product card editor: name, description, price (dollars→cents), photo URL,
 *     dietary tags (chips), ID-required toggle, badge, stock count.
 *     // TODO(storage): replace photo URL input with Supabase Storage upload.
 *  5. Customization options editor: SIZE options (required, single-choice) +
 *     EXTRAS (optional, multi) — each with label + price_cents.
 *     Persisted to `menu_items.options` jsonb.
 *  6. Best Seller / New / Hot badge toggle per product.
 *  7. Publish / unpublish toggle per product.
 *  8. Stock count editor — `stock_count`; note: auto-hide at 0 handled by getMenu.
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Guard: isSupabaseConfigured before any live DB call; demo data otherwise.
 * Icons: @tabler/icons-react only.
 * "use client" — hooks + form state throughout.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CATEGORY_ICONS, getCategoryIcon, CategoryFallbackIcon } from "@/lib/categoryIcons";
import { CategoryCards, type CategoryCard } from "@/components/dashboard/CategoryCards";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChefHat,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconGlass,
  IconLanguage,
  IconLeaf,
  IconMilk,
  IconPackage,
  IconPhoto,
  IconPlus,
  IconStar,
  IconTrash,
  IconX,
  IconFlame,
  IconAlertTriangle,
  IconFish,
  IconAdjustments,
  IconLock,
  IconSparkles,
} from "@tabler/icons-react";
import { readFunctionError } from "@/lib/functionError";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { COLOR_PALETTES, PALETTE_FAMILIES, COLOR_PALETTES_BY_SLUG } from "@/app/m/[slug]/templates/shared/colorPalettes";
import type { PublicBusiness, PublicMenuCategory, PublicMenuItem } from "@/app/m/[slug]/page";
import MenuTemplateRenderer from "@/app/m/[slug]/templates/MenuTemplateRenderer";
import { MenuPaletteContext } from "@/app/m/[slug]/templates/shared/paletteContext";
import { resolvePalette, type MenuPalette } from "@/app/m/[slug]/templates/shared/palettes";
import { resolveActiveBusiness } from "@/lib/business";
import type { Json } from "@/lib/database.types";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type Badge = "best_seller" | "new" | "hot" | null;
type Station = "kitchen" | "bar";

/** Per-item SLA time overrides (minutes). Null fields = fall back to business defaults. */
interface SlaJsonb {
  pending_mins?: number | null;
  preparing_mins?: number | null;
  ready_mins?: number | null;
}

interface OptionItem {
  label: string;
  price_cents: number;
}

interface ItemOptions {
  sizes: OptionItem[];
  extras: OptionItem[];
}

interface MenuCategory {
  id: string;
  business_id: string;
  name: string;
  icon: string | null;
  icon_url: string | null;
  sort: number;
  is_published: boolean;
  name_alt?: string | null; // second-language name (already fetched via select *)
}

interface MenuItem {
  id: string;
  category_id: string;
  business_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  photo_url: string | null;
  dietary_tags: string[];
  id_required: boolean;
  badge: Badge;
  is_available: boolean;
  is_published: boolean;
  stock_count: number | null;
  low_stock_threshold: number | null;
  par_level: number | null;
  options: ItemOptions | null;
  sort: number;
  /** Internal staff notes (not shown to customers). Pro-gated. */
  staff_details: string | null;
  /** Alt-language variant of staff_details. */
  staff_details_alt: string | null;
  /** KDS routing: which station prepares this item. Default: 'kitchen'. */
  station: Station;
  /** Per-item SLA overrides in minutes (null = use business defaults). */
  sla: SlaJsonb | null;
  /** Alt-language description for bilingual menus (migration 044). */
  description_alt: string | null;
  /** Alt-language name for bilingual menus (migration 044). */
  name_alt: string | null;
}

interface CategoryForm {
  name: string;
  icon: string;
  icon_url: string | null;
  // staged photo for upload (only present client-side before saving)
  _stagedIconFile?: File;
  _stagedIconPreview?: string;
}

interface ItemForm {
  name: string;
  description: string;
  priceDollars: string;
  /**
   * Unit cost in dollars (string form for the input). Confidential — owner-only.
   * Never stored on `menu_items`; persisted to `menu_item_costs` (migration 128)
   * so the public menu SELECT can never leak it. Empty string = no cost set.
   */
  costDollars: string;
  photo_url: string;
  dietary_tags: string[];
  id_required: boolean;
  badge: Badge;
  stock_count: string;
  low_stock_threshold: string;
  par_level: string;
  options: ItemOptions;
  /** Internal staff notes (Pro-gated). */
  staff_details: string;
  /** Alt-language variant of staff_details. */
  staff_details_alt: string;
  /** KDS routing station. */
  station: Station;
  /** SLA time overrides (string form for inputs; converted on save). */
  slaForm: { pending_mins: string; preparing_mins: string; ready_mins: string };
  /** Alt-language description (populated by translate button or manually). */
  description_alt: string;
  /** Alt-language name (manually edited — EF does not translate names). */
  name_alt: string;
}

// Photo upload types
interface StagedPhotoFile {
  key: string;      // local React key
  file: File;
  preview: string;  // object URL for preview (revoke on remove/unmount)
}

interface SavedPhoto {
  id: string;
  url: string;
  storage_path: string | null;
  sort: number;
}

// ── Modifier group types (dashboard local state) ──────────────────────────────

interface DashChoice {
  label: string;
  price_cents: number; // can be negative
}

// A group attached to an item in the editor. `groupId` is the UUID from
// modifier_groups (null for a brand-new group not yet saved to DB).
interface DashModifierGroup {
  _localId: string; // stable React key (UUID generated locally)
  groupId: string | null; // null = new, not yet in DB
  key: string; // business-scoped unique key
  label: string;
  type: "single" | "multi";
  min_select: number;
  max_select: number;
  choices: DashChoice[];
  sort: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIETARY_TAG_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "vegetarian", label: "Vegetarian", icon: <IconLeaf size={12} /> },
  { value: "vegan", label: "Vegan", icon: <IconLeaf size={12} /> },
  { value: "gluten_free", label: "Gluten Free", icon: <IconAlertTriangle size={12} /> },
  { value: "dairy_free", label: "Dairy Free", icon: <IconMilk size={12} /> },
  { value: "nut_free", label: "Nut Free", icon: <IconAlertTriangle size={12} /> },
  { value: "seafood", label: "Seafood", icon: <IconFish size={12} /> },
  { value: "spicy", label: "Spicy", icon: <IconFlame size={12} /> },
];

const BADGE_OPTIONS: { value: Badge; label: string }[] = [
  { value: null, label: "None" },
  { value: "best_seller", label: "Best Seller" },
  { value: "new", label: "New" },
  { value: "hot", label: "Hot" },
];

// Menu template options — shared by the selector grid and the collapsed summary.
// hidden?: true → the entry exists in the renderer switch but is NOT shown in
// the selector UI. Useful for in-progress templates that can be tested by setting
// businesses.menu_template_id directly via MCP/Supabase, without exposing them
// to owners yet. Remove hidden:true to graduate a template to general availability.
type TemplateOption = {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  hidden?: true;
};

const MENU_TEMPLATE_OPTIONS: TemplateOption[] = [
  { id: "classic",         name: "Clásica (actual)",      desc: "El diseño de menú actual de JChat — chips de categoría + grid de tarjetas con efectos.", emoji: "⭐" },
  { id: "bottom-nav",      name: "Barra inferior",        desc: "Pestañas abajo + cuadrícula",  emoji: "📱" },
  { id: "left-drawer",     name: "Cajón lateral",         desc: "Menú hamburguesa",             emoji: "☰" },
  { id: "icon-rail",       name: "Riel de iconos",        desc: "Categorías al lado del pulgar", emoji: "🎚️" },
  { id: "sticky-tabs",     name: "Pestañas fijas",        desc: "Una página con scroll-spy",    emoji: "📑" },
  { id: "category-sidebar",name: "Barra de categorías",   desc: "Dos paneles paralelos",        emoji: "🗂️" },
  { id: "fullscreen-type", name: "Tipográfico",           desc: "Índice editorial a pantalla",  emoji: "🅰️" },
  { id: "glass-chips",     name: "Chips de cristal",      desc: "Fotos con chrome esmerilado",  emoji: "🫧" },
  { id: "infinite-feed",   name: "Feed infinito",         desc: "Sin categorías, todo scroll",  emoji: "♾️" },
  { id: "carousel",        name: "Carrusel",              desc: "Un platillo a la vez",         emoji: "🎠" },
  { id: "masonry-search",  name: "Mosaico + búsqueda",    desc: "Descubrir buscando",           emoji: "🔎" },
  { id: "magazine",        name: "Revista",               desc: "Portada y artículos",          emoji: "📰" },
  { id: "store-sections",  name: "Secciones tipo tienda", desc: "Tarjetas grandes por categoría", emoji: "🏬" },
  { id: "streaming-rows",  name: "Filas de streaming",    desc: "Estanterías horizontales",     emoji: "🎬" },
  { id: "timeline",        name: "Línea de tiempo",       desc: "Menú por horario",             emoji: "⏱️" },
  { id: "stories",         name: "Historias",             desc: "Estilo stories a pantalla",    emoji: "⭕" },
  { id: "gesture",         name: "Gestos",                desc: "Navegación por deslizar",      emoji: "👆" },
  { id: "card-stack",      name: "Baraja",                desc: "Deslizar para elegir",         emoji: "🃏" },
  { id: "ai-personalized", name: "IA personalizada",      desc: "Se reordena por cliente",      emoji: "🤖" },
  { id: "immersive",       name: "Inmersivo",             desc: "Cada platillo a pantalla completa", emoji: "🖼️" },
  { id: "luxury",          name: "Lujo experimental",     desc: "Un objeto por capítulo",       emoji: "💎" },
  { id: "bento",           name: "Bento",                 desc: "Bloques de distinto tamaño",   emoji: "🍱", hidden: true },
  { id: "hero-list",       name: "Hero + Lista",          desc: "Foto gigante del plato estrella arriba, lista debajo", emoji: "🖼️", hidden: true },
  { id: "split-diagonal",  name: "Split Diagonal",        desc: "Foto en diagonal, info al lado", emoji: "◣", hidden: true },
  { id: "polaroid",        name: "Polaroid",              desc: "Fotos instantánea con marquito", emoji: "📸", hidden: true },
  { id: "catalog",         name: "Catálogo",              desc: "Rejilla tipo tienda con filtros", emoji: "🛍️", hidden: true },
];

/**
 * Thumbnail for a template card in the selector.
 * Falls back to an emoji placeholder if the PNG is missing.
 */
function TemplateThumb({ id, emoji, alt }: { id: string; emoji: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--db-bg-elevated)", fontSize: 36,
          borderRadius: "var(--db-radius-card)",
        }}
      >
        {emoji}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/menu-templates/${id}.png`}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }}
    />
  );
}

// Card hover-effect options — shared by the selector grid and the collapsed summary.
const CARD_EFFECT_OPTIONS = [
  { id: "lift",      name: "Elevar + Zoom",  desc: "Levanta y acerca",      emoji: "⬆️" },
  { id: "reveal",    name: "Revelar",         desc: "Texto sobre la foto",   emoji: "👁️" },
  { id: "tilt",      name: "Inclinación 3D",  desc: "Sigue el cursor",       emoji: "🎲" },
  { id: "spotlight", name: "Reflector",       desc: "Luz dorada",            emoji: "✨" },
  { id: "duotone",   name: "Duotono",         desc: "Grises → color",        emoji: "🎨" },
  { id: "glass",     name: "Cristal",         desc: "Panel esmerilado",      emoji: "🪟" },
  { id: "shine",     name: "Destello",        desc: "Brillo diagonal",       emoji: "💫" },
  { id: "focus",     name: "Enfoque",         desc: "Desenfocado → nítido",  emoji: "🔍" },
  { id: "neon",      name: "Marco Neón",      desc: "Borde brillante",       emoji: "🌆" },
  { id: "polaroid",  name: "Polaroid",        desc: "Foto inclinada",        emoji: "📷" },
] as const;

const EMPTY_CATEGORY_FORM: CategoryForm = { name: "", icon: "", icon_url: null };

const EMPTY_ITEM_FORM: ItemForm = {
  name: "",
  description: "",
  priceDollars: "",
  costDollars: "",
  photo_url: "",
  dietary_tags: [],
  id_required: false,
  badge: null,
  stock_count: "",
  low_stock_threshold: "",
  par_level: "",
  options: { sizes: [], extras: [] },
  staff_details: "",
  staff_details_alt: "",
  station: "kitchen",
  slaForm: { pending_mins: "", preparing_mins: "", ready_mins: "" },
  description_alt: "",
  name_alt: "",
};

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_CATEGORIES: MenuCategory[] = [
  {
    id: "demo-cat-1",
    business_id: "demo-biz",
    name: "Cocktails",
    icon: "🍹",
    icon_url: null,
    sort: 0,
    is_published: true,
  },
  {
    id: "demo-cat-2",
    business_id: "demo-biz",
    name: "Small Bites",
    icon: "🍟",
    icon_url: null,
    sort: 1,
    is_published: true,
  },
  {
    id: "demo-cat-3",
    business_id: "demo-biz",
    name: "Non-Alcoholic",
    icon: "🥤",
    icon_url: null,
    sort: 2,
    is_published: false,
  },
];

const DEMO_ITEMS: MenuItem[] = [
  {
    id: "demo-item-1",
    category_id: "demo-cat-1",
    business_id: "demo-biz",
    name: "Mango Daiquiri",
    description: "Rum, mango puree, lime juice, served frozen",
    price_cents: 1200,
    photo_url: null,
    dietary_tags: ["vegan"],
    id_required: true,
    badge: "best_seller",
    is_available: true,
    is_published: true,
    stock_count: null,
    low_stock_threshold: null,
    par_level: null,
    options: {
      sizes: [
        { label: "Regular", price_cents: 0 },
        { label: "Large", price_cents: 300 },
      ],
      extras: [
        { label: "Extra shot", price_cents: 200 },
        { label: "Sugar rim", price_cents: 50 },
      ],
    },
    sort: 0,
    staff_details: null,
    staff_details_alt: null,
    station: "bar",
    sla: null,
    description_alt: null,
    name_alt: null,
  },
  {
    id: "demo-item-2",
    category_id: "demo-cat-1",
    business_id: "demo-biz",
    name: "Classic Mojito",
    description: "White rum, mint, lime, sugar, soda",
    price_cents: 1100,
    photo_url: null,
    dietary_tags: ["vegan"],
    id_required: true,
    badge: null,
    is_available: true,
    is_published: true,
    stock_count: null,
    low_stock_threshold: null,
    par_level: null,
    options: { sizes: [], extras: [] },
    sort: 1,
    staff_details: null,
    staff_details_alt: null,
    station: "bar",
    sla: null,
    description_alt: null,
    name_alt: null,
  },
  {
    id: "demo-item-3",
    category_id: "demo-cat-2",
    business_id: "demo-biz",
    name: "Loaded Nachos",
    description: "Tortilla chips, cheese, jalapeños, sour cream, guacamole",
    price_cents: 1400,
    photo_url: null,
    dietary_tags: ["vegetarian", "spicy"],
    id_required: false,
    badge: "hot",
    is_available: true,
    is_published: true,
    stock_count: 5,
    low_stock_threshold: 3,
    par_level: null,
    options: {
      sizes: [],
      extras: [
        { label: "Add chicken", price_cents: 300 },
        { label: "Extra guac", price_cents: 150 },
      ],
    },
    sort: 0,
    staff_details: null,
    staff_details_alt: null,
    station: "kitchen",
    sla: null,
    description_alt: null,
    name_alt: null,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePriceCents(dollars: string): number {
  const val = parseFloat(dollars.replace(/[^0-9.]/g, ""));
  if (isNaN(val) || val < 0) return 0;
  return Math.round(val * 100);
}

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function badgeLabel(badge: Badge, labels: Record<string, string>): string {
  return labels[String(badge)] ?? labels.null;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--db-text-tertiary)",
        marginBottom: "6px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "9px 12px",
        borderRadius: "var(--db-radius)",
        border: "1px solid var(--db-border)",
        background: disabled ? "var(--db-bg-base)" : "var(--db-bg-elevated)",
        color: "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? "var(--db-accent)" : "var(--db-border)",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "var(--db-shadow)",
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
          {label}
        </span>
      )}
    </label>
  );
}

function Alert({
  type,
  children,
  onClose,
}: {
  /** "warning" = non-fatal: the main action succeeded, a side effect did not. */
  type: "error" | "success" | "warning";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const isError = type === "error";
  const isWarning = type === "warning";
  const accent = isError
    ? "var(--db-danger)"
    : isWarning
      ? "var(--db-warning)"
      : "var(--db-success)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        color: accent,
        fontSize: "13px",
        marginBottom: "16px",
        lineHeight: 1.5,
      }}
    >
      {isError || isWarning ? <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <IconCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

// ── Options Editor ─────────────────────────────────────────────────────────────
// Handles the sizes (required, single-choice) and extras (optional, multi) sections
// within the item form. Edits ItemOptions in place.

function OptionsEditor({
  options,
  onChange,
}: {
  options: ItemOptions;
  onChange: (opts: ItemOptions) => void;
}) {
  const t = useTranslations("dashboardCommon");
  const addSize = () =>
    onChange({
      ...options,
      sizes: [...options.sizes, { label: "", price_cents: 0 }],
    });

  const updateSize = (i: number, field: keyof OptionItem, val: string) => {
    const updated = options.sizes.map((s, idx) =>
      idx === i
        ? {
            ...s,
            [field]:
              field === "price_cents"
                ? parsePriceCents(val)
                : val,
          }
        : s
    );
    onChange({ ...options, sizes: updated });
  };

  const removeSize = (i: number) =>
    onChange({ ...options, sizes: options.sizes.filter((_, idx) => idx !== i) });

  const addExtra = () =>
    onChange({
      ...options,
      extras: [...options.extras, { label: "", price_cents: 0 }],
    });

  const updateExtra = (i: number, field: keyof OptionItem, val: string) => {
    const updated = options.extras.map((e, idx) =>
      idx === i
        ? {
            ...e,
            [field]:
              field === "price_cents"
                ? parsePriceCents(val)
                : val,
          }
        : e
    );
    onChange({ ...options, extras: updated });
  };

  const removeExtra = (i: number) =>
    onChange({ ...options, extras: options.extras.filter((_, idx) => idx !== i) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* SIZES — required, single-choice */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <div>
            <SectionLabel>{t("menuOptionsSizesLabel")}</SectionLabel>
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
              {t("menuOptionsSizesHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={addSize}
            style={smallAddBtnStyle}
          >
            <IconPlus size={12} /> {t("menuOptionsAddSizeButton")}
          </button>
        </div>
        {options.sizes.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", fontStyle: "italic" }}>
            {t("menuOptionsNoSizesMessage")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {options.sizes.map((size, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  value={size.label}
                  onChange={(e) => updateSize(i, "label", e.target.value)}
                  placeholder={t("menuOptionsSizePlaceholder")}
                  style={{ ...optionInputStyle, flex: 1 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>+$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={size.price_cents === 0 ? "" : formatDollars(size.price_cents)}
                    onChange={(e) => updateSize(i, "price_cents", e.target.value)}
                    placeholder="0.00"
                    style={{ ...optionInputStyle, width: 80 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSize(i)}
                  style={removeOptionBtnStyle}
                  title={t("menuOptionsRemoveSizeTitle")}
                >
                  <IconX size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EXTRAS — optional, multi-choice */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <div>
            <SectionLabel>{t("menuOptionsExtrasLabel")}</SectionLabel>
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
              {t("menuOptionsExtrasHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={addExtra}
            style={smallAddBtnStyle}
          >
            <IconPlus size={12} /> {t("menuOptionsAddExtraButton")}
          </button>
        </div>
        {options.extras.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", fontStyle: "italic" }}>
            {t("menuOptionsNoExtrasMessage")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {options.extras.map((extra, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  value={extra.label}
                  onChange={(e) => updateExtra(i, "label", e.target.value)}
                  placeholder={t("menuOptionsExtraPlaceholder")}
                  style={{ ...optionInputStyle, flex: 1 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>+$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={extra.price_cents === 0 ? "" : formatDollars(extra.price_cents)}
                    onChange={(e) => updateExtra(i, "price_cents", e.target.value)}
                    placeholder="0.00"
                    style={{ ...optionInputStyle, width: 80 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeExtra(i)}
                  style={removeOptionBtnStyle}
                  title={t("menuOptionsRemoveExtraTitle")}
                >
                  <IconX size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modifier Groups Editor ────────────────────────────────────────────────────
// Replaces OptionsEditor for the new system. Loads business-wide reusable
// groups so the owner can pick from them or create item-specific ones inline.

function ModifierGroupsEditor({
  itemId,
  businessId,
  groups,
  onChange,
}: {
  itemId: string | null;
  businessId: string;
  groups: DashModifierGroup[];
  onChange: (groups: DashModifierGroup[]) => void;
}) {
  const t = useTranslations("dashboardCommon");
  const [bizGroups, setBizGroups] = useState<DashModifierGroup[]>([]);
  const [loadingBiz, setLoadingBiz] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Load all existing modifier_groups for this business (for the reuse picker)
  useEffect(() => {
    if (!isSupabaseConfigured || !businessId || businessId === "demo-biz") return;
    void (async () => {
      setLoadingBiz(true);
      try {
        const { data } = await supabase
          .from("modifier_groups")
          .select("id, key, label, type, min_select, max_select, choices, sort")
          .eq("business_id", businessId)
          .order("label");
        if (!data) return;
        setBizGroups(
          (data as Array<{
            id: string; key: string; label: string; type: string;
            min_select: number; max_select: number; choices: unknown; sort: number;
          }>).map((g) => ({
            _localId: g.id,
            groupId: g.id,
            key: g.key,
            label: g.label,
            type: (g.type === "multi" ? "multi" : "single") as "single" | "multi",
            min_select: g.min_select,
            max_select: g.max_select,
            choices: (Array.isArray(g.choices) ? g.choices : []) as DashChoice[],
            sort: g.sort,
          }))
        );
      } finally {
        setLoadingBiz(false);
      }
    })();
  }, [businessId, itemId]);

  const addNewGroup = () => {
    const newG: DashModifierGroup = {
      _localId: crypto.randomUUID(),
      groupId: null,
      key: `group_${Date.now()}`,
      label: "",
      type: "single",
      min_select: 1,
      max_select: 1,
      choices: [],
      sort: groups.length,
    };
    onChange([...groups, newG]);
  };

  const addReusableGroup = (g: DashModifierGroup) => {
    if (groups.some((eg) => eg.groupId === g.groupId)) return; // already linked
    onChange([...groups, { ...g, _localId: crypto.randomUUID(), sort: groups.length }]);
    setShowPicker(false);
  };

  const updateGroup = (localId: string, patch: Partial<DashModifierGroup>) => {
    onChange(groups.map((g) => (g._localId === localId ? { ...g, ...patch } : g)));
  };

  const removeGroup = (localId: string) => {
    onChange(
      groups
        .filter((g) => g._localId !== localId)
        .map((g, i) => ({ ...g, sort: i }))
    );
  };

  const moveGroup = (localId: string, dir: "up" | "down") => {
    const idx = groups.findIndex((g) => g._localId === localId);
    const next = dir === "up" ? idx - 1 : idx + 1;
    if (next < 0 || next >= groups.length) return;
    const arr = [...groups];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr.map((g, i) => ({ ...g, sort: i })));
  };

  const addChoice = (localId: string) => {
    const g = groups.find((g) => g._localId === localId);
    if (!g) return;
    updateGroup(localId, { choices: [...g.choices, { label: "", price_cents: 0 }] });
  };

  const updateChoice = (localId: string, ci: number, field: keyof DashChoice, val: string) => {
    const g = groups.find((g) => g._localId === localId);
    if (!g) return;
    const choices = g.choices.map((c, i) =>
      i === ci
        ? {
            ...c,
            [field]:
              field === "price_cents"
                ? (val === "" ? 0 : Math.round(parseFloat(val.replace(/[^0-9.-]/g, "")) * 100))
                : val,
          }
        : c
    );
    updateGroup(localId, { choices });
  };

  const removeChoice = (localId: string, ci: number) => {
    const g = groups.find((g) => g._localId === localId);
    if (!g) return;
    updateGroup(localId, { choices: g.choices.filter((_, i) => i !== ci) });
  };

  const alreadyLinkedIds = new Set(groups.map((g) => g.groupId).filter(Boolean));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--db-text-tertiary)", fontStyle: "italic", margin: 0 }}>
          {t("menuModifierEmptyMessage")}
        </p>
      )}

      {groups.map((g, idx) => (
        <GroupCard
          key={g._localId}
          group={g}
          isFirst={idx === 0}
          isLast={idx === groups.length - 1}
          onUpdate={(patch) => updateGroup(g._localId, patch)}
          onRemove={() => removeGroup(g._localId)}
          onMove={(dir) => moveGroup(g._localId, dir)}
          onAddChoice={() => addChoice(g._localId)}
          onUpdateChoice={(ci, field, val) => updateChoice(g._localId, ci, field, val)}
          onRemoveChoice={(ci) => removeChoice(g._localId, ci)}
        />
      ))}

      {/* Action row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={addNewGroup} style={smallAddBtnStyle}>
          <IconPlus size={12} /> {t("menuModifierAddGroupButton")}
        </button>
        {!loadingBiz && bizGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            style={{ ...smallAddBtnStyle, borderColor: showPicker ? "var(--db-accent)" : undefined }}
          >
            <IconAdjustments size={12} />
            {showPicker ? t("menuModifierClosePickerButton") : t("menuModifierReuseGroupButton")}
          </button>
        )}
      </div>

      {/* Reusable group picker */}
      {showPicker && (
        <div
          style={{
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <p style={{ fontSize: 11, color: "var(--db-text-tertiary)", margin: "0 0 4px", fontWeight: 600 }}>
            {t("menuModifierExistingGroupsHeading")}
          </p>
          {bizGroups.map((bg) => {
            const linked = alreadyLinkedIds.has(bg.groupId);
            return (
              <button
                key={bg.groupId}
                type="button"
                disabled={linked}
                onClick={() => addReusableGroup(bg)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "var(--db-radius)",
                  border: "1px solid var(--db-border)",
                  background: linked ? "var(--db-bg-surface)" : "var(--db-bg-surface)",
                  color: linked ? "var(--db-text-tertiary)" : "var(--db-text-primary)",
                  fontSize: 13,
                  cursor: linked ? "default" : "pointer",
                  textAlign: "left",
                  opacity: linked ? 0.5 : 1,
                }}
              >
                <span>
                  <strong>{bg.label}</strong>
                  <span style={{ color: "var(--db-text-tertiary)", marginLeft: 8, fontSize: 11 }}>
                    {bg.type === "single" ? t("menuModifierTypeSingle") : t("menuModifierTypeMulti")} · {t("menuModifierChoicesCount", { count: bg.choices.length })}
                  </span>
                </span>
                {linked ? (
                  <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>{t("menuModifierAlreadyLinkedBadge")}</span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--db-accent)" }}>{t("menuModifierAddToItemButton")}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Single group card inside ModifierGroupsEditor
function GroupCard({
  group,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMove,
  onAddChoice,
  onUpdateChoice,
  onRemoveChoice,
}: {
  group: DashModifierGroup;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<DashModifierGroup>) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
  onAddChoice: () => void;
  onUpdateChoice: (ci: number, field: keyof DashChoice, val: string) => void;
  onRemoveChoice: (ci: number) => void;
}) {
  const t = useTranslations("dashboardCommon");
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        overflow: "hidden",
        background: "var(--db-bg-surface)",
      }}
    >
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "var(--db-bg-elevated)",
          borderBottom: expanded ? "1px solid var(--db-border)" : "none",
        }}
      >
        {/* Reorder */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={isFirst}
            style={{ ...reorderBtnStyle, opacity: isFirst ? 0.2 : 1 }}
          >
            <IconArrowUp size={10} />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={isLast}
            style={{ ...reorderBtnStyle, opacity: isLast ? 0.2 : 1 }}
          >
            <IconArrowDown size={10} />
          </button>
        </div>

        {/* Label input */}
        <input
          value={group.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={t("menuModifierGroupNamePlaceholder")}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-card)",
            color: "var(--db-text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />

        {/* Type toggle */}
        <select
          value={group.type}
          onChange={(e) => {
            const newType = e.target.value as "single" | "multi";
            onUpdate({
              type: newType,
              min_select: newType === "single" ? 1 : 0,
              max_select: newType === "single" ? 1 : group.choices.length || 1,
            });
          }}
          style={{
            padding: "6px 8px",
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "var(--db-bg-card)",
            color: "var(--db-text-secondary)",
            fontSize: 12,
            outline: "none",
          }}
        >
          <option value="single">{t("menuModifierTypeSingle")}</option>
          <option value="multi">{t("menuModifierTypeMulti")}</option>
        </select>

        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ ...iconBtnStyle, color: "var(--db-text-tertiary)" }}
        >
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onRemove}
          style={{ ...iconBtnStyle, color: "var(--db-danger)" }}
        >
          <IconTrash size={14} />
        </button>
      </div>

      {/* Group body */}
      {expanded && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* min/max (only for multi) */}
          {group.type === "multi" && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>{t("menuModifierMinLabel")}</span>
                <input
                  type="number"
                  min={0}
                  max={group.max_select}
                  value={group.min_select}
                  onChange={(e) => onUpdate({ min_select: parseInt(e.target.value) || 0 })}
                  style={{ width: 52, padding: "4px 8px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-card)", color: "var(--db-text-primary)", fontSize: 13, outline: "none" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>{t("menuModifierMaxLabel")}</span>
                <input
                  type="number"
                  min={1}
                  value={group.max_select}
                  onChange={(e) => onUpdate({ max_select: parseInt(e.target.value) || 1 })}
                  style={{ width: 52, padding: "4px 8px", borderRadius: "var(--db-radius)", border: "1px solid var(--db-border)", background: "var(--db-bg-card)", color: "var(--db-text-primary)", fontSize: 13, outline: "none" }}
                />
              </div>
              <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>
                {group.min_select > 0 ? t("menuModifierRequired") : t("menuModifierOptional")}
              </span>
            </div>
          )}

          {/* Choices */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {group.choices.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--db-text-tertiary)", fontStyle: "italic", margin: 0 }}>
                {t("menuModifierNoChoicesMessage")}
              </p>
            )}
            {group.choices.map((c, ci) => (
              <div key={ci} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={c.label}
                  onChange={(e) => onUpdateChoice(ci, "label", e.target.value)}
                  placeholder={t("menuModifierChoicePlaceholder", { n: ci + 1 })}
                  style={{ ...optionInputStyle, flex: 1 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>+$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={c.price_cents === 0 ? "" : (c.price_cents / 100).toFixed(2)}
                    onChange={(e) => onUpdateChoice(ci, "price_cents", e.target.value)}
                    placeholder="0.00"
                    style={{ ...optionInputStyle, width: 76 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveChoice(ci)}
                  style={removeOptionBtnStyle}
                >
                  <IconX size={12} />
                </button>
              </div>
            ))}
            <button type="button" onClick={onAddChoice} style={{ ...smallAddBtnStyle, alignSelf: "flex-start" }}>
              <IconPlus size={11} /> {t("menuModifierAddChoiceButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Placeholder shown instead of a number when the cost is not set (never "0"). */
const EM_DASH = "\u2014";

/** "$" affix for the money inputs (price / cost) in the item editor. */
const moneyPrefixStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: "14px",
  color: "var(--db-text-tertiary)",
  pointerEvents: "none",
};

/** Shared style for the price / cost inputs (leaves room for the "$" affix). */
const moneyInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px 9px 26px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

const optionInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};

const smallAddBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "5px 10px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-secondary)",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const removeOptionBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-secondary)",
  cursor: "pointer",
};

const reorderBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 18,
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-tertiary)",
};

// ── Item Editor Modal ──────────────────────────────────────────────────────────

function ItemEditorModal({
  item,
  businessId,
  itemId,
  onSave,
  onCancel,
  saving,
  isPro,
}: {
  item: ItemForm;
  categoryId: string;
  businessId: string;
  itemId: string | null;
  onSave: (form: ItemForm, staged: StagedPhotoFile[], toDelete: SavedPhoto[], groups: DashModifierGroup[]) => void;
  onCancel: () => void;
  saving: boolean;
  /** True when the business is on the Pro plan — unlocks Pro-gated fields. */
  isPro: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  const dietaryLabels: Record<string, string> = {
    vegetarian: t("menuDietaryVegetarian"),
    vegan: t("menuDietaryVegan"),
    gluten_free: t("menuDietaryGlutenFree"),
    dairy_free: t("menuDietaryDairyFree"),
    nut_free: t("menuDietaryNutFree"),
    seafood: t("menuDietarySeafood"),
    spicy: t("menuDietarySpicy"),
  };
  const badgeLabels: Record<string, string> = {
    null: t("menuBadgeNone"),
    best_seller: t("menuBadgeBestSeller"),
    new: t("menuBadgeNew"),
    hot: t("menuBadgeHot"),
  };
  const [form, setForm] = useState<ItemForm>(item);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ── Cost % / margin (owner-only) ─────────────────────────────────────────────
  // The row appears once a price is set; the figures are only computed when a
  // cost is present too — otherwise they render as an em dash, never as 0.
  const costMetrics = useMemo(() => {
    const priceCents = form.priceDollars.trim() ? parsePriceCents(form.priceDollars) : 0;
    const hasCost = form.costDollars.trim() !== "";
    const costCents = hasCost ? parsePriceCents(form.costDollars) : 0;
    const marginCents = priceCents - costCents;
    return {
      showRow: priceCents > 0,
      hasCost,
      costPct: priceCents > 0 ? (costCents / priceCents) * 100 : 0,
      marginCents,
      marginPct: priceCents > 0 ? (marginCents / priceCents) * 100 : 0,
    };
  }, [form.priceDollars, form.costDollars]);

  // ── Description translate state ──────────────────────────────────────────────
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const handleTranslate = async (direction: "es_to_en" | "en_to_es") => {
    if (!isPro || !form.description.trim() || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const { data, error } = await supabase.functions.invoke("menu-assistant", {
        body: {
          action: "polish_item",
          business_id: businessId,
          name: form.name || "item",
          description: form.description,
          direction,
        },
      });
      if (error) throw error;
      const translated = (data as { translated?: string })?.translated ?? "";
      set("description_alt", translated);
    } catch (err) {
      setTranslateError(await readFunctionError(err));
    } finally {
      setTranslating(false);
    }
  };

  // ── Multi-photo state ────────────────────────────────────────────────────────
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhotoFile[]>([]);
  const [photosToDelete, setPhotosToDelete] = useState<SavedPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // ── Modifier groups state ────────────────────────────────────────────────────
  const [modGroups, setModGroups] = useState<DashModifierGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Load existing photos when editing an existing item
  useEffect(() => {
    if (!isSupabaseConfigured || !itemId) return;
    void (async () => {
      setLoadingPhotos(true);
      try {
        const { data } = await supabase
          .from("menu_item_photos")
          .select("id, url, storage_path, sort")
          .eq("menu_item_id", itemId)
          .order("sort", { ascending: true });
        setSavedPhotos((data ?? []) as SavedPhoto[]);
      } finally {
        setLoadingPhotos(false);
      }
    })();
  }, [itemId]);

  // Load existing modifier groups when editing an existing item
  useEffect(() => {
    if (!isSupabaseConfigured || !itemId) return;
    void (async () => {
      setLoadingGroups(true);
      try {
        const { data: bridges } = await supabase
          .from("menu_item_modifier_groups")
          .select("modifier_group_id, sort")
          .eq("menu_item_id", itemId)
          .order("sort");
        if (!bridges || bridges.length === 0) return;
        const groupIds = bridges.map((b: { modifier_group_id: string }) => b.modifier_group_id);
        const { data: gRows } = await supabase
          .from("modifier_groups")
          .select("id, key, label, type, min_select, max_select, choices, sort")
          .in("id", groupIds);
        if (!gRows) return;
        type GRow = { id: string; key: string; label: string; type: string; min_select: number; max_select: number; choices: unknown; sort: number };
        const byId: Record<string, GRow> = {};
        for (const g of gRows as GRow[]) byId[g.id] = g;
        const loaded: DashModifierGroup[] = (bridges as { modifier_group_id: string; sort: number }[])
          .flatMap((b) => {
            const g = byId[b.modifier_group_id];
            if (!g) return [];
            return [{
              _localId: g.id,
              groupId: g.id,
              key: g.key,
              label: g.label,
              type: (g.type === "multi" ? "multi" : "single") as "single" | "multi",
              min_select: g.min_select,
              max_select: g.max_select,
              choices: (Array.isArray(g.choices) ? g.choices : []) as unknown as DashChoice[],
              sort: b.sort,
            }];
          });
        setModGroups(loaded);
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, [itemId]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newStaged: StagedPhotoFile[] = files.map((file) => ({
      key: `${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setStagedPhotos((prev) => [...prev, ...newStaged]);
    e.target.value = "";
  };

  const removeSavedPhoto = (photo: SavedPhoto) => {
    setSavedPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    setPhotosToDelete((prev) => [...prev, photo]);
  };

  const removeStagedPhoto = (key: string) => {
    setStagedPhotos((prev) => {
      const photo = prev.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter((p) => p.key !== key);
    });
  };

  const toggleTag = (tag: string) => {
    const tags = form.dietary_tags.includes(tag)
      ? form.dietary_tags.filter((tg) => tg !== tag)
      : [...form.dietary_tags, tag];
    set("dietary_tags", tags);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--db-bg-surface)",
          border: "1px solid var(--db-border)",
          borderRadius: "var(--db-radius-card)",
          padding: "28px",
          width: "100%",
          maxWidth: 620,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              margin: 0,
            }}
          >
            {item.name ? t("menuItemEditTitle", { name: item.name }) : t("menuItemNewTitle")}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              color: "var(--db-text-tertiary)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <IconX size={20} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Name */}
          <div>
            <SectionLabel>{t("menuItemNameLabel")}</SectionLabel>
            <FieldInput
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder={t("menuItemNamePlaceholder")}
            />
            {/* Alt-language name (manual only — EF does not translate names) */}
            <div style={{ marginTop: 6 }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--db-text-tertiary)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {t("menuItemNameAltLabel")}
              </span>
              <FieldInput
                value={form.name_alt}
                onChange={(v) => set("name_alt", v)}
                placeholder={t("menuItemNameAltPlaceholder")}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            {/* Label row with translate buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <SectionLabel>{t("menuItemDescriptionLabel")}</SectionLabel>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {translateError && (
                  <span style={{ fontSize: 11, color: "var(--db-danger)", maxWidth: 180, textAlign: "right" }}>
                    {translateError}
                  </span>
                )}
                {translating && (
                  <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>
                    {t("menuItemTranslating")}
                  </span>
                )}
                {(["es_to_en", "en_to_es"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    disabled={!isPro || translating || !form.description.trim()}
                    onClick={() => void handleTranslate(dir)}
                    title={!isPro ? t("menuItemTranslateProUpsell") : undefined}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: "var(--db-radius)",
                      border: "1px solid var(--db-border)",
                      background: "var(--db-bg-elevated)",
                      color: (isPro && !translating && form.description.trim())
                        ? "var(--db-accent)"
                        : "var(--db-text-tertiary)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: (isPro && !translating && form.description.trim())
                        ? "pointer"
                        : "not-allowed",
                      opacity: (!isPro || translating || !form.description.trim()) ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <IconLanguage size={12} />
                    {dir === "es_to_en" ? t("menuItemTranslateToEN") : t("menuItemTranslateToES")}
                    {!isPro && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          background: "var(--db-warning)",
                          color: "#fff",
                          padding: "1px 4px",
                          borderRadius: 999,
                          marginLeft: 2,
                        }}
                      >
                        {t("menuItemTranslateProBadge")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("menuItemDescriptionPlaceholder")}
              rows={2}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "var(--db-radius)",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                fontSize: "14px",
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {/* Alt-language description (filled by translate or manually) */}
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--db-text-tertiary)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {t("menuItemDescriptionAltLabel")}
              </span>
              <textarea
                value={form.description_alt}
                onChange={(e) => set("description_alt", e.target.value)}
                placeholder={t("menuItemDescriptionAltPlaceholder")}
                rows={2}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--db-radius)",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-primary)",
                  fontSize: "14px",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Station — KDS routing */}
          <div>
            <SectionLabel>{t("menuItemStationLabel")}</SectionLabel>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["kitchen", "bar"] as const).map((s) => {
                const sel = form.station === s;
                const StIcon = s === "kitchen" ? IconChefHat : IconGlass;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("station", s)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "7px 16px", borderRadius: "var(--db-radius)",
                      border: sel ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                      background: sel ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                      color: sel ? "var(--db-accent)" : "var(--db-text-secondary)",
                      fontSize: "13px", fontWeight: sel ? 700 : 400, cursor: "pointer",
                    }}
                  >
                    <StIcon size={13} />
                    {s === "kitchen" ? t("menuItemStationKitchen") : t("menuItemStationBar")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price · Cost · Stock */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <SectionLabel>{t("menuItemBasePriceLabel")}</SectionLabel>
              <div style={{ position: "relative" }}>
                <span style={moneyPrefixStyle}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.priceDollars}
                  onChange={(e) => set("priceDollars", e.target.value)}
                  placeholder="0.00"
                  style={moneyInputStyle}
                />
              </div>
            </div>

            {/* Unit cost — confidential, owner-only. Stored in menu_item_costs,
                never on menu_items, so it cannot leak via the public menu. */}
            <div>
              <SectionLabel>{t("menuItemCostLabel")}</SectionLabel>
              <div style={{ position: "relative" }}>
                <span style={moneyPrefixStyle}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costDollars}
                  onChange={(e) => set("costDollars", e.target.value)}
                  placeholder="0.00"
                  style={moneyInputStyle}
                />
              </div>
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: 4 }}>
                {t("menuItemCostHint")}
              </p>
            </div>

            {/* Stock count */}
            <div>
              <SectionLabel>{t("menuItemStockCountLabel")}</SectionLabel>
              <FieldInput
                type="number"
                value={form.stock_count}
                onChange={(v) => set("stock_count", v)}
                placeholder={t("menuItemStockPlaceholder")}
              />
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: 4 }}>
                {t("menuItemStockAutoHiddenHint")}
              </p>
            </div>
          </div>

          {/* Cost % / margin — owner-only maths. Rendered once a price exists;
              each figure falls back to an em dash (never 0) while cost is blank. */}
          {costMetrics.showRow && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                fontSize: "12px",
                color: "var(--db-text-secondary)",
                marginTop: -4,
              }}
            >
              <span>
                {t("menuItemCostPctLabel")}{" "}
                <strong style={{ color: "var(--db-text-primary)" }}>
                  {costMetrics.hasCost ? `${costMetrics.costPct.toFixed(1)}%` : EM_DASH}
                </strong>
              </span>
              <span>
                {t("menuItemMarginLabel")}{" "}
                <strong
                  style={{
                    color: !costMetrics.hasCost
                      ? "var(--db-text-primary)"
                      : costMetrics.marginCents < 0
                        ? "var(--db-danger)"
                        : "var(--db-success)",
                  }}
                >
                  {costMetrics.hasCost
                    ? `${costMetrics.marginCents < 0 ? "\u2212" : ""}$${formatDollars(
                        Math.abs(costMetrics.marginCents)
                      )} (${costMetrics.marginPct.toFixed(1)}%)`
                    : EM_DASH}
                </strong>
              </span>
            </div>
          )}

          {/* Low stock threshold */}
          {form.stock_count !== "" && (
            <div>
              <SectionLabel>{t("menuItemLowStockThresholdLabel")}</SectionLabel>
              <FieldInput
                type="number"
                value={form.low_stock_threshold}
                onChange={(v) => set("low_stock_threshold", v)}
                placeholder={t("menuItemLowStockPlaceholder")}
              />
            </div>
          )}

          {/* Par level — opt-in, only shown when stock tracking is enabled */}
          {form.stock_count !== "" && (
            <div>
              <SectionLabel>{t("menuItemParLevelLabel")}</SectionLabel>
              <FieldInput
                type="number"
                value={form.par_level}
                onChange={(v) => set("par_level", v)}
                placeholder={t("menuItemParLevelPlaceholder")}
              />
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: 4 }}>
                {t("menuItemParLevelHint")}
              </p>
            </div>
          )}

          {/* Product photos */}
          <div>
            <SectionLabel>{t("menuItemPhotosLabel")}</SectionLabel>

            {loadingPhotos ? (
              <p style={{ fontSize: 12, color: "var(--db-text-tertiary)", margin: "0 0 8px" }}>
                {t("menuItemLoadingPhotos")}
              </p>
            ) : (
              <>
                {/* Thumbnail grid */}
                {(savedPhotos.length > 0 || stagedPhotos.length > 0) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {savedPhotos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "var(--db-radius)",
                            border: "1px solid var(--db-border)",
                          }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                          }}
                        />
                        {idx === 0 && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 3,
                              left: 3,
                              fontSize: 9,
                              fontWeight: 700,
                              background: "var(--db-accent)",
                              color: "#fff",
                              padding: "1px 5px",
                              borderRadius: "var(--db-radius)",
                              pointerEvents: "none",
                            }}
                          >
                            {t("menuItemPrimaryPhotoBadge")}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSavedPhoto(photo)}
                          style={{
                            position: "absolute",
                            top: 3,
                            right: 3,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,0.75)",
                            border: "none",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {stagedPhotos.map((photo, idx) => (
                      <div
                        key={photo.key}
                        style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.preview}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "var(--db-radius)",
                            border: "2px dashed var(--db-accent)",
                            opacity: 0.9,
                          }}
                        />
                        {savedPhotos.length === 0 && idx === 0 && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 3,
                              left: 3,
                              fontSize: 9,
                              fontWeight: 700,
                              background: "var(--db-accent)",
                              color: "#fff",
                              padding: "1px 5px",
                              borderRadius: "var(--db-radius)",
                              pointerEvents: "none",
                            }}
                          >
                            {t("menuItemPrimaryPhotoBadge")}
                          </span>
                        )}
                        <span
                          style={{
                            position: "absolute",
                            top: 3,
                            left: 3,
                            fontSize: 9,
                            fontWeight: 700,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            padding: "1px 5px",
                            borderRadius: "var(--db-radius)",
                            pointerEvents: "none",
                          }}
                        >
                          {t("menuItemNewPhotoBadge")}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStagedPhoto(photo.key)}
                          style={{
                            position: "absolute",
                            top: 3,
                            right: 3,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,0.75)",
                            border: "none",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload label / button */}
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: "var(--db-radius)",
                    border: "1px dashed var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: "var(--db-text-secondary)",
                    fontSize: 12,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <IconPhoto size={14} />
                  {t("menuItemAddPhotosButton")}
                </label>

              </>
            )}
          </div>

          {/* Dietary tags */}
          <div>
            <SectionLabel>{t("menuItemDietaryTagsLabel")}</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {DIETARY_TAG_OPTIONS.map((opt) => {
                const active = form.dietary_tags.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleTag(opt.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 12px",
                      borderRadius: "999px",
                      border: active
                        ? "2px solid var(--db-accent)"
                        : "1px solid var(--db-border)",
                      background: active ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                      color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
                      fontSize: "12px",
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {opt.icon}
                    {dietaryLabels[opt.value]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Badge */}
          <div>
            <SectionLabel>{t("menuItemBadgeLabel")}</SectionLabel>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {BADGE_OPTIONS.map((b) => {
                const sel = form.badge === b.value;
                return (
                  <button
                    key={String(b.value)}
                    type="button"
                    onClick={() => set("badge", b.value)}
                    style={{
                      padding: "5px 14px",
                      borderRadius: "var(--db-radius)",
                      border: sel
                        ? "2px solid var(--db-accent)"
                        : "1px solid var(--db-border)",
                      background: sel ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                      color: sel ? "var(--db-accent)" : "var(--db-text-secondary)",
                      fontSize: "12px",
                      fontWeight: sel ? 700 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {b.value === "best_seller" && <IconStar size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                    {b.value === "hot" && <IconFlame size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                    {b.value === "new" && <IconStar size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                    {badgeLabels[String(b.value)]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles row */}
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <Toggle
              checked={form.id_required}
              onChange={(v) => set("id_required", v)}
              label={t("menuItemIdRequiredToggle")}
            />
          </div>

          {/* Staff notes (Pro-gated) ─────────────────────────────────────────── */}
          <div>
            {/* Label row with Pro badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--db-text-tertiary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {t("menuItemStaffDetailsLabel")}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--db-warning)",
                  color: "#fff",
                  padding: "2px 7px",
                  borderRadius: 999,
                }}
              >
                {t("menuItemStaffDetailsProBadge")}
              </span>
            </div>

            {/* Primary language textarea */}
            <textarea
              value={form.staff_details}
              onChange={(e) => set("staff_details", e.target.value)}
              placeholder={t("menuItemStaffDetailsPlaceholder")}
              disabled={!isPro}
              rows={3}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "var(--db-radius)",
                border: "1px solid var(--db-border)",
                background: isPro ? "var(--db-bg-elevated)" : "var(--db-bg-base)",
                color: "var(--db-text-primary)",
                fontSize: "14px",
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
                outline: "none",
                opacity: isPro ? 1 : 0.5,
                cursor: isPro ? "auto" : "not-allowed",
              }}
            />

            {/* Alt language textarea */}
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--db-text-tertiary)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {t("menuItemStaffDetailsAltLabel")}
              </span>
              <textarea
                value={form.staff_details_alt}
                onChange={(e) => set("staff_details_alt", e.target.value)}
                placeholder={t("menuItemStaffDetailsPlaceholder")}
                disabled={!isPro}
                rows={2}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--db-radius)",
                  border: "1px solid var(--db-border)",
                  background: isPro ? "var(--db-bg-elevated)" : "var(--db-bg-base)",
                  color: "var(--db-text-primary)",
                  fontSize: "14px",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                  opacity: isPro ? 1 : 0.5,
                  cursor: isPro ? "auto" : "not-allowed",
                }}
              />
            </div>

            {/* Upsell (non-Pro only) */}
            {!isPro && (
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: "12px",
                  color: "var(--db-warning)",
                  fontWeight: 500,
                  marginTop: 6,
                  marginBottom: 0,
                }}
              >
                <IconLock size={13} />
                {t("menuItemStaffDetailsProUpsell")}
              </p>
            )}

            {/* Help text (always visible) */}
            <p
              style={{
                fontSize: "11px",
                color: "var(--db-text-tertiary)",
                marginTop: isPro ? 6 : 4,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              {t("menuItemStaffDetailsHint")}
            </p>
          </div>

          {/* SLA — Timings override (collapsible, advanced) */}
          <details
            style={{
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius)",
              overflow: "hidden",
            }}
          >
            <summary
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--db-text-secondary)",
                userSelect: "none",
                listStyle: "none",
              }}
            >
              ▸ {t("menuItemSlaLabel")}
            </summary>
            <div
              style={{
                padding: "14px",
                borderTop: "1px solid var(--db-border)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                background: "var(--db-bg-elevated)",
              }}
            >
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
                {t("menuItemSlaHint")}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <SectionLabel>{t("menuItemSlaPendingMins")}</SectionLabel>
                  <FieldInput
                    type="number"
                    value={form.slaForm.pending_mins}
                    onChange={(v) => set("slaForm", { ...form.slaForm, pending_mins: v })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <SectionLabel>{t("menuItemSlaPreparingMins")}</SectionLabel>
                  <FieldInput
                    type="number"
                    value={form.slaForm.preparing_mins}
                    onChange={(v) => set("slaForm", { ...form.slaForm, preparing_mins: v })}
                    placeholder="—"
                  />
                </div>
                <div>
                  <SectionLabel>{t("menuItemSlaReadyMins")}</SectionLabel>
                  <FieldInput
                    type="number"
                    value={form.slaForm.ready_mins}
                    onChange={(v) => set("slaForm", { ...form.slaForm, ready_mins: v })}
                    placeholder="—"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* Divider */}
          <div
            style={{
              borderTop: "1px solid var(--db-border)",
              paddingTop: "18px",
            }}
          >
            <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: 8 }}>
              <IconAdjustments size={16} color="var(--db-accent)" />
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                {t("menuItemModifierGroupsHeading")}
              </span>
              {loadingGroups && (
                <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>{tCommon("loading")}</span>
              )}
            </div>
            {!loadingGroups && (
              <ModifierGroupsEditor
                itemId={itemId}
                businessId={businessId}
                groups={modGroups}
                onChange={setModGroups}
              />
            )}
          </div>
        </div>

        {/* Modal actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "24px",
            paddingTop: "16px",
            borderTop: "1px solid var(--db-border)",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--db-radius)",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-text-secondary)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={() => onSave(form, stagedPhotos, photosToDelete, modGroups)}
            disabled={saving || !form.name.trim() || !form.priceDollars.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 20px",
              borderRadius: "var(--db-radius)",
              border: "none",
              background:
                saving || !form.name.trim() || !form.priceDollars.trim()
                  ? "var(--db-text-tertiary)"
                  : "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor:
                saving || !form.name.trim() || !form.priceDollars.trim()
                  ? "not-allowed"
                  : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            <IconCheck size={15} />
            {saving ? t("menuItemSavingState") : t("menuItemSaveButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category Form ─────────────────────────────────────────────────────────────

function CategoryFormPanel({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: CategoryForm;
  onSave: (f: CategoryForm) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  // Display-only labels for the icon picker — the persisted value (menu_categories.icon)
  // never changes; getCategoryIcon()/CATEGORY_ICON_MAP key off it untouched.
  const iconLabels: Record<string, string> = {
    cocktail: t("menuIconCocktail"),
    beer: t("menuIconBeer"),
    beer_filled: t("menuIconBeerFilled"),
    wine: t("menuIconWine"),
    champagne: t("menuIconChampagne"),
    spirits: t("menuIconSpirits"),
    bottle: t("menuIconBottle"),
    coffee: t("menuIconCoffee"),
    milk: t("menuIconMilk"),
    milkshake: t("menuIconMilkshake"),
    juice: t("menuIconJuice"),
    cup: t("menuIconCup"),
    water: t("menuIconWater"),
    lemon: t("menuIconLemon"),
    pizza: t("menuIconPizza"),
    burger: t("menuIconBurger"),
    meat: t("menuIconMeat"),
    sausage: t("menuIconSausage"),
    grill: t("menuIconGrill"),
    fish: t("menuIconFish"),
    dumpling: t("menuIconDumpling"),
    soup: t("menuIconSoup"),
    bowl: t("menuIconBowl"),
    salad: t("menuIconSalad"),
    leaf: t("menuIconLeaf"),
    plant: t("menuIconPlant"),
    carrot: t("menuIconCarrot"),
    mushroom: t("menuIconMushroom"),
    pepper: t("menuIconPepper"),
    bread: t("menuIconBread"),
    baguette: t("menuIconBaguette"),
    egg: t("menuIconEgg"),
    eggs: t("menuIconEggs"),
    cheese: t("menuIconCheese"),
    cake: t("menuIconCake"),
    ice_cream: t("menuIconIceCream"),
    ice_cream2: t("menuIconIceCream2"),
    cookie: t("menuIconCookie"),
    candy: t("menuIconCandy"),
    chocolate: t("menuIconChocolate"),
    apple: t("menuIconApple"),
    spicy: t("menuIconSpicy"),
    star: t("menuIconStar"),
    new: t("menuIconNew"),
    heart: t("menuIconHeart"),
    crown: t("menuIconCrown"),
    salt: t("menuIconSalt"),
    frozen: t("menuIconFrozen"),
    kids: t("menuIconKids"),
    chef: t("menuIconChef"),
    kitchen: t("menuIconKitchen"),
    category: t("menuIconCategory"),
  };
  const [form, setForm] = useState<CategoryForm>(initial);
  const [iconMode, setIconMode] = useState<"icon" | "photo">(
    initial.icon_url ? "photo" : "icon"
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form._stagedIconPreview) URL.revokeObjectURL(form._stagedIconPreview);
    const preview = URL.createObjectURL(file);
    setForm((p) => ({
      ...p,
      icon: "",
      icon_url: null,
      _stagedIconFile: file,
      _stagedIconPreview: preview,
    }));
  }

  function handleRemovePhoto() {
    if (form._stagedIconPreview) URL.revokeObjectURL(form._stagedIconPreview);
    setForm((p) => ({
      ...p,
      icon_url: null,
      _stagedIconFile: undefined,
      _stagedIconPreview: undefined,
    }));
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "6px 0",
    borderRadius: "var(--db-radius)",
    border: "none",
    background: active ? "var(--db-accent)" : "transparent",
    color: active ? "var(--db-accent-text)" : "var(--db-text-secondary)",
    fontSize: "12px",
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
  });

  const currentIconPreview = form._stagedIconPreview ?? form.icon_url;

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-accent)",
        borderRadius: "var(--db-radius-card)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Name row */}
      <div>
        <SectionLabel>{t("menuCategoryNameLabel")}</SectionLabel>
        <FieldInput
          value={form.name}
          onChange={(v) => setForm((p) => ({ ...p, name: v }))}
          placeholder={t("menuCategoryNamePlaceholder")}
        />
      </div>

      {/* Icon section */}
      <div>
        <SectionLabel>{t("menuCategoryIconLabel")}</SectionLabel>
        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--db-bg-elevated)",
            borderRadius: "var(--db-radius)",
            padding: "2px",
            marginBottom: "10px",
            border: "1px solid var(--db-border)",
            width: 160,
          }}
        >
          <button
            type="button"
            onClick={() => setIconMode("icon")}
            style={tabStyle(iconMode === "icon")}
          >
            {t("menuCategoryIconLabel")}
          </button>
          <button
            type="button"
            onClick={() => setIconMode("photo")}
            style={tabStyle(iconMode === "photo")}
          >
            {t("menuCategoryPhotoTab")}
          </button>
        </div>

        {iconMode === "icon" ? (
          /* ── Tabler icon gallery ───────────────────────────────────────────── */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))",
              gap: "6px",
              maxHeight: 220,
              overflowY: "auto",
              padding: "2px",
            }}
          >
            {CATEGORY_ICONS.map(({ name, label, Icon }) => {
              const selected = form.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={iconLabels[name] ?? label}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      icon: name,
                      icon_url: null,
                      _stagedIconFile: undefined,
                      _stagedIconPreview: undefined,
                    }))
                  }
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    padding: "6px 4px",
                    borderRadius: "var(--db-radius)",
                    border: selected
                      ? "2px solid var(--db-accent)"
                      : "2px solid transparent",
                    background: selected
                      ? "rgba(var(--db-accent-rgb,217,119,6),0.12)"
                      : "var(--db-bg-elevated)",
                    cursor: "pointer",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                >
                  <Icon
                    size={22}
                    stroke={1.5}
                    color={selected ? "var(--db-accent)" : "var(--db-text-secondary)"}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      color: selected ? "var(--db-accent)" : "var(--db-text-tertiary)",
                      textAlign: "center",
                      lineHeight: 1.2,
                      maxWidth: 52,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {iconLabels[name] ?? label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* ── Photo upload ──────────────────────────────────────────────────── */
          <div>
            {currentIconPreview ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentIconPreview}
                  alt=""
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "2px solid var(--db-accent)",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--db-danger)",
                    border: "none",
                    color: "#fff",
                    fontSize: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  border: "2px dashed var(--db-border)",
                  cursor: "pointer",
                  fontSize: 20,
                  color: "var(--db-text-tertiary)",
                }}
              >
                +
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 14px",
            borderRadius: "var(--db-radius)",
            border: "1px solid var(--db-border)",
            background: "transparent",
            color: "var(--db-text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          {tCommon("cancel")}
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "7px 14px",
            borderRadius: "var(--db-radius)",
            border: "none",
            background: saving || !form.name.trim() ? "var(--db-text-tertiary)" : "var(--db-accent)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
          }}
        >
          <IconCheck size={13} />
          {saving ? t("menuCategorySavingState") : tCommon("save")}
        </button>
      </div>
    </div>
  );
}

// ── Item Card ──────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onEdit,
  onTogglePublish,
  onDelete,
  toggling,
  deleting,
}: {
  item: MenuItem;
  onEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  const dietaryLabels: Record<string, string> = {
    vegetarian: t("menuDietaryVegetarian"),
    vegan: t("menuDietaryVegan"),
    gluten_free: t("menuDietaryGlutenFree"),
    dairy_free: t("menuDietaryDairyFree"),
    nut_free: t("menuDietaryNutFree"),
    seafood: t("menuDietarySeafood"),
    spicy: t("menuDietarySpicy"),
  };
  const badgeLabels: Record<string, string> = {
    null: t("menuBadgeNone"),
    best_seller: t("menuBadgeBestSeller"),
    new: t("menuBadgeNew"),
    hot: t("menuBadgeHot"),
  };
  return (
    <div
      style={{
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "14px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        opacity: item.is_published ? 1 : 0.6,
      }}
    >
      {/* Photo thumbnail or placeholder */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--db-radius)",
          overflow: "hidden",
          background: "var(--db-bg-overlay)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--db-text-tertiary)",
        }}
      >
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo_url}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <IconPhoto size={22} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: 2 }}>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--db-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </span>
          {item.badge && (
            <span
              style={{
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background:
                  item.badge === "best_seller"
                    ? "rgba(217,119,6,0.18)"
                    : item.badge === "hot"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(34,197,94,0.15)",
                color:
                  item.badge === "best_seller"
                    ? "var(--db-warning)"
                    : item.badge === "hot"
                    ? "var(--db-danger)"
                    : "var(--db-success)",
              }}
            >
              {badgeLabel(item.badge, badgeLabels)}
            </span>
          )}
          {!item.is_published && (
            <span
              style={{
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 600,
                background: "var(--db-bg-overlay)",
                color: "var(--db-text-tertiary)",
              }}
            >
              {t("hiddenBadge")}
            </span>
          )}
          {item.id_required && (
            <span
              style={{
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 600,
                background: "rgba(124,58,237,0.14)",
                color: "var(--db-text-secondary)",
              }}
            >
              21+
            </span>
          )}
          {item.stock_count !== null && (
            <span
              style={{
                padding: "1px 8px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 600,
                background:
                  item.stock_count <= (item.low_stock_threshold ?? 0) && item.stock_count > 0
                    ? "rgba(245,158,11,0.14)"
                    : item.stock_count === 0
                    ? "rgba(239,68,68,0.14)"
                    : "var(--db-bg-overlay)",
                color:
                  item.stock_count <= (item.low_stock_threshold ?? 0) && item.stock_count > 0
                    ? "var(--db-warning)"
                    : item.stock_count === 0
                    ? "var(--db-danger)"
                    : "var(--db-text-tertiary)",
              }}
            >
              <IconPackage size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />
              {item.stock_count === 0
                ? t("menuItemCardOutOfStockBadge")
                : t("menuItemCardStockLeftCount", { count: item.stock_count })}
            </span>
          )}
        </div>

        {item.description && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--db-text-tertiary)",
              margin: "2px 0 4px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.description}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-accent)" }}>
            ${formatDollars(item.price_cents)}
          </span>

          {item.dietary_tags.length > 0 && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {item.dietary_tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "1px 7px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    background: "var(--db-bg-overlay)",
                    color: "var(--db-text-tertiary)",
                  }}
                >
                  {dietaryLabels[tag] ?? tag}
                </span>
              ))}
            </div>
          )}

          {item.options &&
            ((item.options.sizes?.length ?? 0) > 0 || (item.options.extras?.length ?? 0) > 0) && (
              <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
                {(item.options.sizes?.length ?? 0) > 0 && t("menuItemCardSizesCount", { count: item.options.sizes!.length })}
                {(item.options.sizes?.length ?? 0) > 0 && (item.options.extras?.length ?? 0) > 0 && " · "}
                {(item.options.extras?.length ?? 0) > 0 && t("menuItemCardExtrasCount", { count: item.options.extras!.length })}
              </span>
            )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title={t("menuItemCardEditTitle")}
          style={iconBtnStyle}
        >
          <IconEdit size={14} />
        </button>
        <button
          onClick={onTogglePublish}
          disabled={toggling}
          title={item.is_published ? t("menuItemCardHideTitle") : t("menuItemCardShowTitle")}
          style={{ ...iconBtnStyle, opacity: toggling ? 0.5 : 1 }}
        >
          {item.is_published ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title={t("menuItemCardDeleteTitle")}
          style={{
            ...iconBtnStyle,
            color: "var(--db-danger)",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

// ── CategorySection ────────────────────────────────────────────────────────────

// "Uncategorized" is a data literal created by inventory/page.tsx's addProduct()
// as the default category name — map it to a translated label at display time only,
// never touch the persisted menu_categories.name value itself.
function displayCategoryName(name: string, t: (key: string) => string): string {
  return name === "Uncategorized" ? t("menuUncategorizedLabel") : name;
}

// Display-only — `slug` (the persisted businesses.menu_palette_id value and
// the key compared everywhere in this file) is never translated. Falls back
// to the raw slug for a stale/unknown value (e.g. a deleted palette), same
// as the `?? menuPalette` this replaces — mirrors the safe-fallback pattern
// used for enum labels elsewhere (team/verification in super-admin).
function paletteDisplayName(slug: string, t: (key: string) => string): string {
  return COLOR_PALETTES_BY_SLUG[slug] ? t(`menuPalettes.names.${slug}`) : slug;
}

function CategorySection({
  category,
  allCategories,
  items,
  onMoveUp,
  onMoveDown,
  onEditCategory,
  onToggleCategoryPublish,
  onDeleteCategory,
  onAddItem,
  onEditItem,
  onToggleItemPublish,
  onDeleteItem,
  togglingCat,
  togglingItem,
  deletingItem,
  savingItem,
  activeItemEdit,
  onItemSave,
  onItemEditCancel,
  isPro,
}: {
  category: MenuCategory;
  allCategories: MenuCategory[];
  items: MenuItem[];
  onMoveUp: (cat: MenuCategory) => void;
  onMoveDown: (cat: MenuCategory) => void;
  onEditCategory: (cat: MenuCategory) => void;
  onToggleCategoryPublish: (cat: MenuCategory) => void;
  onDeleteCategory: (cat: MenuCategory) => void;
  onAddItem: (categoryId: string) => void;
  onEditItem: (item: MenuItem) => void;
  onToggleItemPublish: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  togglingCat: boolean;
  togglingItem: string | null;
  deletingItem: string | null;
  savingItem: boolean;
  activeItemEdit: { item: ItemForm; itemId: string | null; categoryId: string } | null;
  onItemSave: (form: ItemForm, staged: StagedPhotoFile[], toDelete: SavedPhoto[], groups: DashModifierGroup[]) => void;
  onItemEditCancel: () => void;
  /** True when the business is on the Pro plan — unlocks Pro-gated fields. */
  isPro: boolean;
}) {
  const t = useTranslations("dashboardCommon");
  const [collapsed, setCollapsed] = useState(false);
  const isFirst = allCategories[0]?.id === category.id;
  const isLast = allCategories[allCategories.length - 1]?.id === category.id;

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        overflow: "hidden",
      }}
    >
      {/* Category header */}
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "var(--db-bg-elevated)",
          borderBottom: collapsed ? "none" : "1px solid var(--db-border)",
        }}
      >
        {/* Reorder buttons */}
        {/* TODO(dnd): replace these up/down buttons with drag-to-reorder
             once a DnD library is approved. The `sort` field in menu_categories
             is the source of truth for order. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <button
            onClick={() => onMoveUp(category)}
            disabled={isFirst}
            title={t("menuCategoryMoveUpTitle")}
            style={{
              ...reorderBtnStyle,
              opacity: isFirst ? 0.25 : 1,
              cursor: isFirst ? "default" : "pointer",
            }}
          >
            <IconArrowUp size={12} />
          </button>
          <button
            onClick={() => onMoveDown(category)}
            disabled={isLast}
            title={t("menuCategoryMoveDownTitle")}
            style={{
              ...reorderBtnStyle,
              opacity: isLast ? 0.25 : 1,
              cursor: isLast ? "default" : "pointer",
            }}
          >
            <IconArrowDown size={12} />
          </button>
        </div>

        {/* Icon + name */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            padding: 0,
            color: "var(--db-text-primary)",
          }}
        >
          {category.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={category.icon_url}
              alt=""
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                border: "1px solid var(--db-border)",
              }}
            />
          ) : (() => {
            const TablerIcon = getCategoryIcon(category.icon);
            if (TablerIcon) return <TablerIcon size={20} stroke={1.5} color="var(--db-accent)" />;
            if (category.icon) return <span style={{ fontSize: "18px", lineHeight: 1 }}>{category.icon}</span>;
            return <CategoryFallbackIcon size={20} stroke={1.5} color="var(--db-text-tertiary)" />;
          })()}
          <span style={{ fontSize: "15px", fontWeight: 700 }}>{displayCategoryName(category.name, t)}</span>
          <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginLeft: 2 }}>
            {t("menuCategoryItemCount", { count: items.length })}
          </span>
          {!category.is_published && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "1px 8px",
                borderRadius: "999px",
                background: "var(--db-bg-overlay)",
                color: "var(--db-text-tertiary)",
              }}
            >
              {t("hiddenBadge")}
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--db-text-tertiary)" }}>
            {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          </span>
        </button>

        {/* Category actions */}
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={() => onEditCategory(category)}
            title={t("menuCategoryEditTitle")}
            style={iconBtnStyle}
          >
            <IconEdit size={14} />
          </button>
          <button
            onClick={() => onToggleCategoryPublish(category)}
            disabled={togglingCat}
            title={category.is_published ? t("menuCategoryHideTitle") : t("menuCategoryShowTitle")}
            style={{ ...iconBtnStyle, opacity: togglingCat ? 0.5 : 1 }}
          >
            {category.is_published ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </button>
          <button
            onClick={() => onDeleteCategory(category)}
            title={t("menuCategoryDeleteTitle")}
            style={{ ...iconBtnStyle, color: "var(--db-danger)" }}
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {/* Items list */}
      {!collapsed && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {items.length === 0 && (
            <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", fontStyle: "italic", margin: 0 }}>
              {t("menuCategoryNoItemsMessage")}
            </p>
          )}

          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={() => onEditItem(item)}
              onTogglePublish={() => onToggleItemPublish(item)}
              onDelete={() => onDeleteItem(item)}
              toggling={togglingItem === item.id}
              deleting={deletingItem === item.id}
            />
          ))}

          {/* Add product button */}
          <button
            onClick={() => onAddItem(category.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 14px",
              borderRadius: "var(--db-radius)",
              border: "1px dashed var(--db-border)",
              background: "transparent",
              color: "var(--db-text-tertiary)",
              fontSize: "13px",
              cursor: "pointer",
              alignSelf: "flex-start",
              marginTop: 4,
            }}
          >
            <IconPlus size={14} />
            {t("menuCategoryAddProductButton")}
          </button>
        </div>
      )}

      {/* Item editor modal — rendered at category level to avoid z-index issues */}
      {activeItemEdit && activeItemEdit.categoryId === category.id && (
        <ItemEditorModal
          item={activeItemEdit.item}
          categoryId={category.id}
          businessId={category.business_id}
          itemId={activeItemEdit.itemId}
          onSave={onItemSave}
          onCancel={onItemEditCancel}
          saving={savingItem}
          isPro={isPro}
        />
      )}
    </div>
  );
}

// ── AI Menu Assistant entry point (Pro) ───────────────────────────────────────

const assistantEntryStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "9px 16px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-accent)",
  background: "var(--db-accent-bg)",
  color: "var(--db-accent)",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const assistantProBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

// ── Main page component ────────────────────────────────────────────────────────

export default function MenuPage() {
  const t = useTranslations("dashboardCommon");
  const tCommon = useTranslations("common");
  /** Strings for the AI Menu Assistant entry point (own namespace). */
  const tAssistant = useTranslations("menuAssistant");
  /** Shown when a non-Pro owner taps the assistant entry point. */
  const [showAssistantProNotice, setShowAssistantProNotice] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  /**
   * Unit cost per item, in cents (migration 128). Kept OUT of `MenuItem` on
   * purpose: `menu_items` never carries the cost, so the public menu cannot
   * leak it. RLS on `menu_item_costs` already limits this to the owner.
   */
  const [costsByItemId, setCostsByItemId] = useState<Record<string, number | null>>({});
  /** Soft, non-blocking notice (e.g. the item saved but its cost did not). */
  const [warning, setWarning] = useState<string | null>(null);
  // Category card selector: null = "Todas" (show every category).
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string>("demo-biz");
  /** Plan of the owner (users.plan) — "pro" enables Pro-gated fields. */
  const [bizPlan, setBizPlan] = useState<string | null>(null);
  /** Subscription status of the owner (users.plan_status) — must be active/trialing. */
  const [bizPlanStatus, setBizPlanStatus] = useState<string | null>(null);
  const [menuEnabled, setMenuEnabled] = useState(false);
  const [togglingMenu, setTogglingMenu] = useState(false);
  const [menuMode, setMenuMode] = useState<"none" | "external" | "web">("none");
  const [externalMenuUrl, setExternalMenuUrl] = useState<string>("");
  const [urlInput, setUrlInput] = useState<string>("");
  const [savingMode, setSavingMode] = useState(false);
  const [cardEffect, setCardEffect] = useState<string>("lift");
  const [savingEffect, setSavingEffect] = useState(false);
  const [menuTemplate, setMenuTemplate] = useState<string>("classic");
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [menuPalette, setMenuPalette] = useState<string | null>(null);
  const [savingPalette, setSavingPalette] = useState<string | null>(null);
  // Collapsible sections — closed by default for a cleaner dashboard.
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPalettes, setShowPalettes] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [bizSlug, setBizSlug] = useState<string | null>(null);
  const [bizName, setBizName] = useState<string>("");
  const [bizCoverUrl, setBizCoverUrl] = useState<string | null>(null);
  const [bizIconEmoji, setBizIconEmoji] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previewSectionRefs = useRef(new Map<string, HTMLElement>());
  const previewData = useMemo(() => {
    // Palette logic — identical to MenuPageClient L1376-1379:
    // a custom COLOR_PALETTES slug overrides the template's board palette;
    // unknown slug or null falls back to the board palette.
    const boardPalette = resolvePalette(menuTemplate);
    const previewPalette: MenuPalette = menuPalette
      ? (COLOR_PALETTES_BY_SLUG[menuPalette] ?? boardPalette)
      : boardPalette;
    const previewBusiness: PublicBusiness = {
      id: businessId,
      slug: bizSlug ?? "",
      name: bizName,
      category: null,
      description: null,
      cover_url: bizCoverUrl,
      icon_emoji: bizIconEmoji,
      menu_card_effect: cardEffect,
      menu_template_id: menuTemplate,
      menu_palette_id: menuPalette,
    };
    const previewCategories: PublicMenuCategory[] = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      icon_url: cat.icon_url,
      sort: cat.sort,
      items: items
        .filter((it) => it.category_id === cat.id)
        .map((it): PublicMenuItem => ({
          id: it.id,
          category_id: it.category_id,
          name: it.name,
          description: it.description,
          price_cents: it.price_cents,
          photo_url: it.photo_url,
          dietary_tags: it.dietary_tags,
          badge: it.badge,
          stock_count: it.stock_count,
          options: { sizes: it.options?.sizes ?? [], extras: it.options?.extras ?? [] },
          groups: [],
          photos: [],
          sort: it.sort,
        })),
    }));
    return { previewBusiness, previewCategories, previewPalette };
  }, [businessId, bizSlug, bizName, bizCoverUrl, bizIconEmoji, cardEffect, menuTemplate, menuPalette, categories, items]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noBusiness, setNoBusiness] = useState(false);

  // Category form state
  const [showCatForm, setShowCatForm] = useState(false);
  const [catFormInitial, setCatFormInitial] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [togglingCatId, setTogglingCatId] = useState<string | null>(null);

  // Item form state
  const [activeItemEdit, setActiveItemEdit] = useState<{
    item: ItemForm;
    itemId: string | null;
    categoryId: string;
  } | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCategories(DEMO_CATEGORIES);
      setItems(DEMO_ITEMS);
      // Demo mode has no auth session — unlock Pro-gated UI so it stays previewable.
      setBizPlan("pro");
      setBizPlanStatus("active");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Resolve the owner's business via the shared helper (most-recent;
      // tolerant of multiple businesses per owner).
      const res = await resolveActiveBusiness();
      if (!res.ok) {
        if (res.reason === "no_business" || res.reason === "unauthenticated") {
          setNoBusiness(true);
          return;
        }
        throw new Error(res.message);
      }
      setNoBusiness(false);
      const bid: string = res.business.id;
      setBusinessId(bid);
      // Read plan from the USER, not the business (billing is per-user — migration 106).
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: planRow } = await supabase
          .from("users")
          .select("plan, plan_status")
          .eq("id", user.id)
          .maybeSingle();
        if (planRow) {
          setBizPlan((planRow as { plan: string; plan_status: string }).plan);
          setBizPlanStatus((planRow as { plan: string; plan_status: string }).plan_status);
        }
      }
      setMenuEnabled(res.business.menu_enabled ?? false);
      const mode = res.business.menu_mode ?? "none";
      setMenuMode(mode);
      const extUrl = res.business.external_menu_url ?? "";
      setExternalMenuUrl(extUrl);
      setUrlInput(extUrl);
      setCardEffect((res.business as unknown as { menu_card_effect?: string }).menu_card_effect ?? "lift");
      setMenuTemplate((res.business as unknown as { menu_template_id?: string }).menu_template_id ?? "classic");
      setMenuPalette((res.business as unknown as { menu_palette_id?: string | null }).menu_palette_id ?? null);
      setBizSlug((res.business as unknown as { slug?: string }).slug ?? null);
      setBizName(res.business.name ?? "");

      const [catsResult, itemsResult, bizExtResult, costsResult] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("business_id", bid)
          .order("sort", { ascending: true }),
        supabase
          .from("menu_items")
          .select("*")
          .eq("business_id", bid)
          .order("sort", { ascending: true }),
        supabase
          .from("businesses")
          .select("cover_url, icon_emoji")
          .eq("id", bid)
          .maybeSingle(),
        supabase
          .from("menu_item_costs")
          .select("menu_item_id, cost_cents")
          .eq("business_id", bid),
      ]);

      if (catsResult.error) throw catsResult.error;
      if (itemsResult.error) throw itemsResult.error;
      setBizCoverUrl((bizExtResult.data as { cover_url?: string | null } | null)?.cover_url ?? null);
      setBizIconEmoji((bizExtResult.data as { icon_emoji?: string | null } | null)?.icon_emoji ?? null);

      // Costs are non-fatal: a failure here must not block the menu editor,
      // it only means the cost fields come up blank.
      const costMap: Record<string, number | null> = {};
      if (costsResult.error) {
        console.warn("[menu] could not load item costs:", costsResult.error.message);
      } else {
        for (const row of (costsResult.data ?? []) as { menu_item_id: string; cost_cents: number | null }[]) {
          costMap[row.menu_item_id] = row.cost_cents;
        }
      }
      setCostsByItemId(costMap);

      setCategories((catsResult.data as MenuCategory[]) ?? []);
      // Normalize options to guard against DB rows where options is {} or has null arrays
      const rawItems = (itemsResult.data as unknown as MenuItem[]) ?? [];
      setItems(rawItems.map((item) => ({
        ...item,
        options: item.options
          ? { sizes: item.options.sizes ?? [], extras: item.options.extras ?? [] }
          : null,
      })));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(t("menuLoadError", { msg }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Category reorder (up/down) ───────────────────────────────────────────────
  // TODO(dnd): drag-to-reorder — replace up/down buttons with a DnD lib
  //  (e.g. @dnd-kit/core). The `sort` column is the single source of truth
  //  and must be updated atomically in the DB.
  const reorderCategory = useCallback(
    async (cat: MenuCategory, direction: "up" | "down") => {
      const sorted = [...categories].sort((a, b) => a.sort - b.sort);
      const idx = sorted.findIndex((c) => c.id === cat.id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      const sibling = sorted[targetIdx];
      const newA = { ...cat, sort: sibling.sort };
      const newB = { ...sibling, sort: cat.sort };

      // Optimistic local update
      setCategories((prev) =>
        prev.map((c) => (c.id === newA.id ? newA : c.id === newB.id ? newB : c))
      );

      if (!isSupabaseConfigured) return;

      try {
        await Promise.all([
          supabase.from("menu_categories").update({ sort: newA.sort }).eq("id", newA.id),
          supabase.from("menu_categories").update({ sort: newB.sort }).eq("id", newB.id),
        ]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuReorderError", { msg }));
        void loadData(); // revert
      }
    },
    [categories, loadData]
  );

  // ── Save category (create / update) ─────────────────────────────────────────
  const handleSaveCategory = useCallback(
    async (form: CategoryForm) => {
      if (!form.name.trim()) {
        setError(t("menuCategoryNameRequiredError"));
        return;
      }
      setSavingCat(true);
      setError(null);

      // Resolve final icon_url — upload staged file if present
      let resolvedIconUrl: string | null = form.icon_url ?? null;
      if (form._stagedIconFile && isSupabaseConfigured) {
        const file = form._stagedIconFile;
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${businessId}/category-icons/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("menu-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          setError(t("menuCategoryUploadError", { msg: upErr.message }));
          setSavingCat(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("menu-photos").getPublicUrl(path);
        resolvedIconUrl = urlData.publicUrl;
      }

      // When photo mode chosen: clear emoji; when emoji mode: clear url
      const finalIcon = resolvedIconUrl ? null : (form.icon || null);
      const finalIconUrl = resolvedIconUrl;

      if (!isSupabaseConfigured) {
        if (editingCatId) {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === editingCatId
                ? { ...c, name: form.name.trim(), icon: finalIcon, icon_url: finalIconUrl }
                : c
            )
          );
        } else {
          const newCat: MenuCategory = {
            id: `demo-cat-${Date.now()}`,
            business_id: "demo-biz",
            name: form.name.trim(),
            icon: finalIcon,
            icon_url: finalIconUrl,
            sort: categories.length,
            is_published: true,
          };
          setCategories((prev) => [...prev, newCat]);
        }
        setShowCatForm(false);
        setEditingCatId(null);
        setCatFormInitial(EMPTY_CATEGORY_FORM);
        setSavingCat(false);
        setSuccess(t("menuCategorySavedSuccess", { name: form.name.trim() }));
        return;
      }

      try {
        if (editingCatId) {
          const { error: err } = await supabase
            .from("menu_categories")
            .update({ name: form.name.trim(), icon: finalIcon, icon_url: finalIconUrl } as never)
            .eq("id", editingCatId);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from("menu_categories").insert({
            business_id: businessId,
            name: form.name.trim(),
            icon: finalIcon,
            icon_url: finalIconUrl,
            sort: categories.length,
            is_published: true,
          } as never);
          if (err) throw err;
        }
        setSuccess(t("menuCategorySavedSuccess", { name: form.name.trim() }));
        setShowCatForm(false);
        setEditingCatId(null);
        setCatFormInitial(EMPTY_CATEGORY_FORM);
        await loadData();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuCategorySaveError", { msg }));
      } finally {
        setSavingCat(false);
      }
    },
    [editingCatId, businessId, categories.length, loadData]
  );

  // ── Toggle category publish ──────────────────────────────────────────────────
  const handleToggleCategoryPublish = useCallback(
    async (cat: MenuCategory) => {
      setTogglingCatId(cat.id);
      const next = !cat.is_published;

      if (!isSupabaseConfigured) {
        setCategories((prev) =>
          prev.map((c) => (c.id === cat.id ? { ...c, is_published: next } : c))
        );
        setTogglingCatId(null);
        return;
      }

      try {
        const { error: err } = await supabase
          .from("menu_categories")
          .update({ is_published: next })
          .eq("id", cat.id);
        if (err) throw err;
        setCategories((prev) =>
          prev.map((c) => (c.id === cat.id ? { ...c, is_published: next } : c))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuToggleError", { msg }));
      } finally {
        setTogglingCatId(null);
      }
    },
    []
  );

  // ── Toggle menu_enabled (show menu icon in chat) ─────────────────────────────
  const handleToggleMenuEnabled = useCallback(
    async (next: boolean) => {
      setMenuEnabled(next); // optimistic
      if (!isSupabaseConfigured) return;
      setTogglingMenu(true);
      try {
        const { error: err } = await supabase
          .from("businesses")
          .update({ menu_enabled: next })
          .eq("id", businessId);
        if (err) throw err;
      } catch {
        setMenuEnabled(!next); // revert
        setError(t("menuVisibilityUpdateError"));
      } finally {
        setTogglingMenu(false);
      }
    },
    [businessId],
  );

  // ── Save menu mode ───────────────────────────────────────────────────────────
  const handleSaveMenuMode = useCallback(
    async (mode: "none" | "external" | "web") => {
      if (!isSupabaseConfigured || !businessId) return;

      // Validate URL when saving external mode
      if (mode === "external") {
        const trimmed = urlInput.trim();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
          setError(t("menuUrlProtocolError"));
          return;
        }
        setSavingMode(true);
        try {
          const { error: err } = await supabase
            .from("businesses")
            .update({ menu_mode: "external", external_menu_url: trimmed })
            .eq("id", businessId);
          if (err) throw err;
          setMenuMode("external");
          setExternalMenuUrl(trimmed);
          setSuccess(t("menuModeSavedSuccess"));
        } catch {
          setError(t("menuModeSaveError"));
        } finally {
          setSavingMode(false);
        }
      } else {
        // For 'none' or future 'web', just update mode and clear url
        setSavingMode(true);
        try {
          const { error: err } = await supabase
            .from("businesses")
            .update({ menu_mode: mode, external_menu_url: null })
            .eq("id", businessId);
          if (err) throw err;
          setMenuMode(mode);
          setExternalMenuUrl("");
          setUrlInput("");
          setSuccess(t("menuModeUpdatedSuccess"));
        } catch {
          setError(t("menuModeSaveError"));
        } finally {
          setSavingMode(false);
        }
      }
    },
    [businessId, urlInput],
  );

  const handleSaveCardEffect = useCallback(
    async (eff: string) => {
      if (!isSupabaseConfigured || !businessId) return;
      setSavingEffect(true);
      try {
        const { error: err } = await supabase
          .from("businesses")
          .update({ menu_card_effect: eff } as never)
          .eq("id", businessId);
        if (err) throw err;
        setCardEffect(eff);
        setSuccess(t("menuEffectSavedSuccess"));
      } catch {
        setError(t("menuEffectSaveError"));
      } finally {
        setSavingEffect(false);
      }
    },
    [businessId],
  );

  const handleSaveTemplate = useCallback(
    async (tpl: string) => {
      if (!isSupabaseConfigured || !businessId) return;
      setSavingTemplate(tpl);
      try {
        const { error: err } = await supabase
          .from("businesses")
          .update({ menu_template_id: tpl, menu_palette_id: null } as never)
          .eq("id", businessId);
        if (err) throw err;
        setMenuTemplate(tpl);
        setMenuPalette(null);
        setSuccess(t("menuTemplateSavedSuccess"));
      } catch {
        setError(t("menuTemplateSaveError"));
      } finally {
        setSavingTemplate(null);
      }
    },
    [businessId],
  );

  const handleSavePalette = useCallback(
    async (slug: string | null) => {
      if (!isSupabaseConfigured || !businessId) return;
      // Sentinel for the "original" option so the saving state can key on it.
      setSavingPalette(slug ?? "__original__");
      try {
        const { error: err } = await supabase
          .from("businesses")
          .update({ menu_palette_id: slug } as never)
          .eq("id", businessId);
        if (err) throw err;
        setMenuPalette(slug);
        setSuccess(slug ? t("menuPaletteSavedSuccess") : t("menuPaletteResetSuccess"));
      } catch {
        setError(t("menuPaletteSaveError"));
      } finally {
        setSavingPalette(null);
      }
    },
    [businessId],
  );

  // ── Delete category ──────────────────────────────────────────────────────────
  const handleDeleteCategory = useCallback(
    async (cat: MenuCategory) => {
      if (
        !window.confirm(
          t("menuDeleteCategoryConfirm", { name: cat.name })
        )
      )
        return;

      if (!isSupabaseConfigured) {
        setCategories((prev) => prev.filter((c) => c.id !== cat.id));
        setItems((prev) => prev.filter((i) => i.category_id !== cat.id));
        return;
      }

      try {
        const { error: err } = await supabase
          .from("menu_categories")
          .delete()
          .eq("id", cat.id);
        if (err) throw err;
        await loadData();
        setSuccess(t("menuCategoryDeletedSuccess", { name: cat.name }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuDeleteError", { msg }));
      }
    },
    [loadData]
  );

  // ── Open item editor ─────────────────────────────────────────────────────────
  const openAddItem = useCallback((categoryId: string) => {
    setActiveItemEdit({
      item: { ...EMPTY_ITEM_FORM, options: { sizes: [], extras: [] } },
      itemId: null,
      categoryId,
    });
  }, []);

  const openEditItem = useCallback((item: MenuItem) => {
    const existingSla = item.sla as SlaJsonb | null;
    const costCents = costsByItemId[item.id];
    setActiveItemEdit({
      item: {
        name: item.name,
        description: item.description ?? "",
        priceDollars: formatDollars(item.price_cents),
        costDollars: costCents != null ? formatDollars(costCents) : "",
        photo_url: item.photo_url ?? "",
        dietary_tags: item.dietary_tags ?? [],
        id_required: item.id_required,
        badge: item.badge,
        stock_count: item.stock_count != null ? String(item.stock_count) : "",
        low_stock_threshold:
          item.low_stock_threshold != null ? String(item.low_stock_threshold) : "",
        par_level: item.par_level != null ? String(item.par_level) : "",
        options: item.options ?? { sizes: [], extras: [] },
        staff_details: item.staff_details ?? "",
        staff_details_alt: item.staff_details_alt ?? "",
        station: (item.station as Station) ?? "kitchen",
        description_alt: item.description_alt ?? "",
        name_alt: item.name_alt ?? "",
        slaForm: {
          pending_mins:   existingSla?.pending_mins   != null ? String(existingSla.pending_mins)   : "",
          preparing_mins: existingSla?.preparing_mins != null ? String(existingSla.preparing_mins) : "",
          ready_mins:     existingSla?.ready_mins     != null ? String(existingSla.ready_mins)     : "",
        },
      },
      itemId: item.id,
      categoryId: item.category_id,
    });
  }, [costsByItemId]);

  // ── Save item (with multi-photo support) ────────────────────────────────────
  const handleSaveItem = useCallback(
    async (form: ItemForm, stagedPhotos: StagedPhotoFile[], photosToDelete: SavedPhoto[], modGroups: DashModifierGroup[] = []) => {
      if (!activeItemEdit) return;
      if (!form.name.trim() || !form.priceDollars.trim()) {
        setError(t("menuItemNamePriceRequiredError"));
        return;
      }
      setSavingItem(true);
      setError(null);
      setWarning(null);

      // Convert SLA string fields → jsonb or null
      const slaOut: SlaJsonb | null = (
        form.slaForm.pending_mins.trim() || form.slaForm.preparing_mins.trim() || form.slaForm.ready_mins.trim()
      ) ? {
        pending_mins:   form.slaForm.pending_mins.trim()   ? parseInt(form.slaForm.pending_mins, 10)   : null,
        preparing_mins: form.slaForm.preparing_mins.trim() ? parseInt(form.slaForm.preparing_mins, 10) : null,
        ready_mins:     form.slaForm.ready_mins.trim()     ? parseInt(form.slaForm.ready_mins, 10)     : null,
      } : null;

      // Unit cost → cents (or null when the field is left blank). Deliberately
      // NOT part of `payload`: it is persisted to `menu_item_costs`, never to
      // `menu_items` (see migration 128).
      const costCentsOut: number | null =
        form.costDollars.trim() !== "" ? parsePriceCents(form.costDollars) : null;

      const payload = {
        category_id: activeItemEdit.categoryId,
        business_id: businessId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: parsePriceCents(form.priceDollars),
        photo_url: form.photo_url.trim() || null,
        dietary_tags: form.dietary_tags,
        id_required: form.id_required,
        badge: form.badge,
        is_available: true,
        is_published: true,
        stock_count:
          form.stock_count.trim() !== "" ? parseInt(form.stock_count, 10) : null,
        low_stock_threshold:
          form.low_stock_threshold.trim() !== ""
            ? parseInt(form.low_stock_threshold, 10)
            : null,
        par_level:
          form.par_level.trim() !== "" ? parseInt(form.par_level, 10) : null,
        options: form.options,
        // Staff notes (Pro-gated; always included in payload — DB stores null when blank).
        staff_details: form.staff_details.trim() || null,
        staff_details_alt: form.staff_details_alt.trim() || null,
        // Bilingual description & name (migration 044).
        description_alt: form.description_alt.trim() || null,
        name_alt: form.name_alt.trim() || null,
        // KDS routing & SLA
        station: form.station,
        sla: slaOut,
      };

      if (!isSupabaseConfigured) {
        const demoPayload = { ...payload, sla: slaOut };
        let demoItemId = activeItemEdit.itemId ?? "";
        if (activeItemEdit.itemId) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === activeItemEdit.itemId ? { ...it, ...demoPayload } : it
            )
          );
        } else {
          const newItem: MenuItem = {
            id: `demo-item-${Date.now()}`,
            sort: items.filter((i) => i.category_id === activeItemEdit.categoryId).length,
            ...demoPayload,
          };
          setItems((prev) => [...prev, newItem]);
          demoItemId = newItem.id;
        }
        setCostsByItemId((prev) => ({ ...prev, [demoItemId]: costCentsOut }));
        setActiveItemEdit(null);
        setSavingItem(false);
        setSuccess(t("menuItemSavedSuccess", { name: form.name.trim() }));
        return;
      }

      let costSaveFailed = false;

      try {
        // low_stock_threshold is NOT NULL with default 5 in the DB.
        // payload keeps null (for MenuItem type compat in demo path) but we
        // strip it here so the DB default is used on INSERT and the field is
        // left untouched on UPDATE.
        const dbPayload = {
          ...payload,
          // NOT NULL with default 5 — omit when null so DB uses its default.
          low_stock_threshold: payload.low_stock_threshold ?? undefined,
          // ItemOptions and SlaJsonb are valid JSON; cast required because Supabase
          // types use the recursive Json type which TS can't infer from custom interfaces.
          options: (payload.options ?? { sizes: [], extras: [] }) as unknown as Json,
          sla: payload.sla as unknown as Json | null,
        };

        // 1. Create or update the menu item; for new items capture the ID.
        let resolvedItemId: string;
        if (activeItemEdit.itemId) {
          resolvedItemId = activeItemEdit.itemId;
          const { error: err } = await supabase
            .from("menu_items")
            .update(dbPayload)
            .eq("id", resolvedItemId);
          if (err) throw err;
        } else {
          const sort = items.filter(
            (i) => i.category_id === activeItemEdit.categoryId
          ).length;
          const { data: newRow, error: err } = await supabase
            .from("menu_items")
            .insert({ ...dbPayload, sort })
            .select("id")
            .single();
          if (err) throw err;
          resolvedItemId = (newRow as { id: string }).id;
        }

        // 1b. Persist the confidential unit cost. Non-fatal on purpose: the item
        // itself is already saved at this point, so a cost write failure must not
        // surface as a failed save — warn softly and keep the product.
        try {
          const { error: costErr } = await supabase
            .from("menu_item_costs")
            .upsert(
              {
                menu_item_id: resolvedItemId,
                business_id: businessId,
                cost_cents: costCentsOut,
              },
              { onConflict: "menu_item_id" }
            );
          if (costErr) throw costErr;
        } catch (costErr: unknown) {
          // Swallowed by design — a transport failure here must not roll the
          // whole save back into the outer catch.
          console.warn(
            "[menu] could not save item cost:",
            costErr instanceof Error ? costErr.message : String(costErr)
          );
          costSaveFailed = true;
        }

        // 2. Delete photos removed by the user (Storage object + DB row).
        for (const photo of photosToDelete) {
          if (photo.storage_path) {
            await supabase.storage.from("menu-photos").remove([photo.storage_path]);
          }
          await supabase.from("menu_item_photos").delete().eq("id", photo.id);
        }

        // 3. Upload staged (new) photos and insert rows.
        const uploadedUrls: string[] = [];
        // Use Unix seconds (not ms) so the value fits in PostgreSQL integer
        // (max ~2.1 B). Date.now() in ms (~1.78 T in 2026) would overflow.
        const baseSort = Math.floor(Date.now() / 1000);
        for (let i = 0; i < stagedPhotos.length; i++) {
          const { file } = stagedPhotos[i];
          const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
          const storagePath = `${businessId}/${resolvedItemId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("menu-photos")
            .upload(storagePath, file, { contentType: file.type, upsert: false });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage
            .from("menu-photos")
            .getPublicUrl(storagePath);
          const { error: rowErr } = await supabase.from("menu_item_photos").insert({
            menu_item_id: resolvedItemId,
            business_id: businessId,
            url: pub.publicUrl,
            storage_path: storagePath,
            sort: baseSort + i,
          });
          if (rowErr) throw rowErr;
          uploadedUrls.push(pub.publicUrl);
        }

        // 4. Sync menu_items.photo_url with the first photo (sort asc).
        if (stagedPhotos.length > 0 || photosToDelete.length > 0) {
          const { data: firstPhoto } = await supabase
            .from("menu_item_photos")
            .select("url")
            .eq("menu_item_id", resolvedItemId)
            .order("sort", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (firstPhoto) {
            await supabase
              .from("menu_items")
              .update({ photo_url: (firstPhoto as { url: string }).url })
              .eq("id", resolvedItemId);
          }
        }

        // 5. Sync modifier groups: upsert group rows, replace bridge rows.
        if (modGroups.length > 0) {
          for (const g of modGroups) {
            if (!g.groupId) {
              // New group: insert into modifier_groups, capture id
              const { data: newG, error: gErr } = await supabase
                .from("modifier_groups")
                .insert({
                  business_id: businessId,
                  key: g.key || `item_${resolvedItemId}_${g._localId.slice(0, 8)}`,
                  label: g.label || "Opciones",
                  type: g.type,
                  min_select: g.min_select,
                  max_select: g.max_select,
                  choices: g.choices as unknown as Json,
                  sort: g.sort,
                })
                .select("id")
                .single();
              if (gErr) throw gErr;
              g.groupId = (newG as { id: string }).id;
            } else {
              // Existing group: update its data (owner may have changed label/choices)
              await supabase
                .from("modifier_groups")
                .update({
                  label: g.label,
                  type: g.type,
                  min_select: g.min_select,
                  max_select: g.max_select,
                  choices: g.choices as unknown as Json,
                })
                .eq("id", g.groupId);
            }
          }
          // Replace bridge rows: delete all for this item, re-insert in sort order
          await supabase
            .from("menu_item_modifier_groups")
            .delete()
            .eq("menu_item_id", resolvedItemId);
          const bridgeRows = modGroups.map((g, i) => ({
            menu_item_id: resolvedItemId,
            modifier_group_id: g.groupId!,
            sort: i,
          }));
          const { error: bridgeErr } = await supabase
            .from("menu_item_modifier_groups")
            .insert(bridgeRows);
          if (bridgeErr) throw bridgeErr;
        } else if (activeItemEdit?.itemId) {
          // Item had groups before, now cleared — remove bridge rows
          await supabase
            .from("menu_item_modifier_groups")
            .delete()
            .eq("menu_item_id", resolvedItemId);
        }

        setSuccess(t("menuItemSavedSuccess", { name: form.name.trim() }));
        if (costSaveFailed) setWarning(t("menuItemCostSaveWarning"));
        setActiveItemEdit(null);
        await loadData();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuItemSaveError", { msg }));
      } finally {
        setSavingItem(false);
      }
    },
    [activeItemEdit, businessId, items, loadData]
  );

  // ── Toggle item publish ──────────────────────────────────────────────────────
  const handleToggleItemPublish = useCallback(
    async (item: MenuItem) => {
      setTogglingItemId(item.id);
      const next = !item.is_published;

      if (!isSupabaseConfigured) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_published: next } : it))
        );
        setTogglingItemId(null);
        return;
      }

      try {
        const { error: err } = await supabase
          .from("menu_items")
          .update({ is_published: next })
          .eq("id", item.id);
        if (err) throw err;
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_published: next } : it))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuToggleError", { msg }));
      } finally {
        setTogglingItemId(null);
      }
    },
    []
  );

  // ── Delete item ──────────────────────────────────────────────────────────────
  const handleDeleteItem = useCallback(
    async (item: MenuItem) => {
      if (!window.confirm(t("menuDeleteItemConfirm", { name: item.name }))) return;
      setDeletingItemId(item.id);

      if (!isSupabaseConfigured) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setDeletingItemId(null);
        return;
      }

      try {
        const { error: err } = await supabase
          .from("menu_items")
          .delete()
          .eq("id", item.id);
        if (err) throw err;
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setSuccess(t("menuItemDeletedSuccess", { name: item.name }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(t("menuDeleteError", { msg }));
      } finally {
        setDeletingItemId(null);
      }
    },
    []
  );

  // ── Sorted categories ────────────────────────────────────────────────────────
  const sortedCategories = [...categories].sort((a, b) => a.sort - b.sort);

  // ── Category cards (selector) — real counts + honest warnings ────────────────
  const categoryCards: CategoryCard[] = sortedCategories.map((cat) => {
    const catItems = items.filter((it) => it.category_id === cat.id);
    const published = catItems.filter((it) => it.is_published);
    const outOfStock = published.filter(
      (it) => it.is_available === false || (it.stock_count != null && it.stock_count <= 0),
    ).length;
    return {
      id: cat.id,
      name: displayCategoryName(cat.name, t),
      iconUrl: cat.icon_url,
      icon: cat.icon,
      publishedCount: published.length,
      outOfStock,
      hidden: !cat.is_published,
      untranslated: !cat.name_alt || cat.name_alt.trim() === "",
    };
  });
  const totalPublishedItems = items.filter((it) => it.is_published).length;
  // The cards act as a filter; null = show all categories.
  const visibleCategories = activeCategoryId
    ? sortedCategories.filter((c) => c.id === activeCategoryId)
    : sortedCategories;

  // Display-only label/desc maps for the template & effect pickers — the
  // persisted id (businesses.menu_template_id / menu_card_effect) never changes.
  const templateLabels: Record<string, string> = {
    classic: t("menuTemplateClassic"),
    "bottom-nav": t("menuTemplateBottomNav"),
    "left-drawer": t("menuTemplateLeftDrawer"),
    "icon-rail": t("menuTemplateIconRail"),
    "sticky-tabs": t("menuTemplateStickyTabs"),
    "category-sidebar": t("menuTemplateCategorySidebar"),
    "fullscreen-type": t("menuTemplateFullscreenType"),
    "glass-chips": t("menuTemplateGlassChips"),
    "infinite-feed": t("menuTemplateInfiniteFeed"),
    carousel: t("menuTemplateCarousel"),
    "masonry-search": t("menuTemplateMasonrySearch"),
    magazine: t("menuTemplateMagazine"),
    "store-sections": t("menuTemplateStoreSections"),
    "streaming-rows": t("menuTemplateStreamingRows"),
    timeline: t("menuTemplateTimeline"),
    stories: t("menuTemplateStories"),
    gesture: t("menuTemplateGesture"),
    "card-stack": t("menuTemplateCardStack"),
    "ai-personalized": t("menuTemplateAiPersonalized"),
    immersive: t("menuTemplateImmersive"),
    luxury: t("menuTemplateLuxury"),
    bento: t("menuTemplateBento"),
    "hero-list": t("menuTemplateHeroList"),
    "split-diagonal": t("menuTemplateSplitDiagonal"),
    polaroid: t("menuTemplatePolaroid"),
    catalog: t("menuTemplateCatalog"),
  };
  const templateDescs: Record<string, string> = {
    classic: t("menuTemplateDescClassic"),
    "bottom-nav": t("menuTemplateDescBottomNav"),
    "left-drawer": t("menuTemplateDescLeftDrawer"),
    "icon-rail": t("menuTemplateDescIconRail"),
    "sticky-tabs": t("menuTemplateDescStickyTabs"),
    "category-sidebar": t("menuTemplateDescCategorySidebar"),
    "fullscreen-type": t("menuTemplateDescFullscreenType"),
    "glass-chips": t("menuTemplateDescGlassChips"),
    "infinite-feed": t("menuTemplateDescInfiniteFeed"),
    carousel: t("menuTemplateDescCarousel"),
    "masonry-search": t("menuTemplateDescMasonrySearch"),
    magazine: t("menuTemplateDescMagazine"),
    "store-sections": t("menuTemplateDescStoreSections"),
    "streaming-rows": t("menuTemplateDescStreamingRows"),
    timeline: t("menuTemplateDescTimeline"),
    stories: t("menuTemplateDescStories"),
    gesture: t("menuTemplateDescGesture"),
    "card-stack": t("menuTemplateDescCardStack"),
    "ai-personalized": t("menuTemplateDescAiPersonalized"),
    immersive: t("menuTemplateDescImmersive"),
    luxury: t("menuTemplateDescLuxury"),
    bento: t("menuTemplateDescBento"),
    "hero-list": t("menuTemplateDescHeroList"),
    "split-diagonal": t("menuTemplateDescSplitDiagonal"),
    polaroid: t("menuTemplateDescPolaroid"),
    catalog: t("menuTemplateDescCatalog"),
  };
  const effectLabels: Record<string, string> = {
    lift: t("menuEffectLift"),
    reveal: t("menuEffectReveal"),
    tilt: t("menuEffectTilt"),
    spotlight: t("menuEffectSpotlight"),
    duotone: t("menuEffectDuotone"),
    glass: t("menuEffectGlass"),
    shine: t("menuEffectShine"),
    focus: t("menuEffectFocus"),
    neon: t("menuEffectNeon"),
    polaroid: t("menuEffectPolaroid"),
  };
  const effectDescs: Record<string, string> = {
    lift: t("menuEffectDescLift"),
    reveal: t("menuEffectDescReveal"),
    tilt: t("menuEffectDescTilt"),
    spotlight: t("menuEffectDescSpotlight"),
    duotone: t("menuEffectDescDuotone"),
    glass: t("menuEffectDescGlass"),
    shine: t("menuEffectDescShine"),
    focus: t("menuEffectDescFocus"),
    neon: t("menuEffectDescNeon"),
    polaroid: t("menuEffectDescPolaroid"),
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (noBusiness) {
    return (
      <div style={{ maxWidth: 880 }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          {t("menuEditorTitle")}
        </h1>
        <NoBusinessCTA message={t("menuNoBusinessMessage")} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ flex: "1 1 0", minWidth: 0, maxWidth: 760 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--db-text-primary)",
              marginBottom: "4px",
              margin: 0,
            }}
          >
            {t("menuEditorTitle")}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginTop: 4 }}>
            {t("menuEditorSubtitle")}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          {/* AI Menu Assistant (Pro) — the real plan gate lives server-side in the
              menu-assistant Edge Function; this only avoids a dead-end click. */}
          {(bizPlan === "pro" && (bizPlanStatus === "active" || bizPlanStatus === "trialing")) ||
          !isSupabaseConfigured ? (
            <Link href="/dashboard/menu/assistant" style={assistantEntryStyle}>
              <IconSparkles size={16} />
              {tAssistant("entryButton")}
              <span style={assistantProBadgeStyle}>{tAssistant("proBadge")}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowAssistantProNotice(true)}
              style={{ ...assistantEntryStyle, cursor: "pointer" }}
            >
              <IconSparkles size={16} />
              {tAssistant("entryButton")}
              <span style={assistantProBadgeStyle}>{tAssistant("proBadge")}</span>
            </button>
          )}

          {/* menu_enabled toggle */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <Toggle
              checked={menuEnabled}
              onChange={(v) => void handleToggleMenuEnabled(v)}
              label={t("menuShowInChatToggle")}
            />
            <span
              style={{
                fontSize: "11px",
                color: togglingMenu ? "var(--db-text-tertiary)" : "var(--db-text-tertiary)",
                opacity: togglingMenu ? 0.5 : 1,
              }}
            >
              {t("menuShowInChatHint")}
            </span>
          </div>
        </div>
      </div>

      {/* Demo mode banner */}
      {!isSupabaseConfigured && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--db-radius)",
            background: "rgba(245,158,11,0.12)",
            color: "var(--db-warning)",
            fontSize: "13px",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}
        >
          {t.rich("menuDemoModeMessage", {
            strong: (chunks) => <strong>{chunks}</strong>,
            code: (chunks) => <code>{chunks}</code>,
          })}
        </div>
      )}

      {/* AI Menu Assistant — "Pro only" notice for non-Pro owners */}
      {showAssistantProNotice && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowAssistantProNotice(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--db-bg-card)",
              border: "1px solid var(--db-border)",
              borderRadius: "var(--db-radius-card)",
              padding: "24px",
              maxWidth: "380px",
              width: "100%",
              textAlign: "center",
            }}
          >
            <IconLock size={32} color="var(--db-accent)" />
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "10px 0 6px" }}>
              {tAssistant("proOnlyTitle")}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
              {tAssistant("proOnlyMessage")}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/dashboard/billing"
                style={{
                  padding: "10px 18px",
                  borderRadius: "var(--db-radius)",
                  background: "var(--db-accent)",
                  color: "var(--db-accent-text)",
                  fontSize: "13px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {tAssistant("lockedCta")}
              </Link>
              <button
                type="button"
                onClick={() => setShowAssistantProNotice(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: "var(--db-radius)",
                  border: "1px solid var(--db-border)",
                  background: "var(--db-bg-elevated)",
                  color: "var(--db-text-secondary)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {tAssistant("proOnlyClose")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <Alert type="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {warning && (
        <Alert type="warning" onClose={() => setWarning(null)}>
          {warning}
        </Alert>
      )}
      {success && (
        <Alert type="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* ── Modo del menú ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--db-bg-card)",
          border: "1px solid var(--db-border)",
          borderRadius: "var(--db-radius-card)",
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
          {t("menuModeSectionTitle")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
          {t("menuModeSectionDesc")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Opción 1 — Link externo */}
          <label
            style={{
              display: "block",
              padding: "14px 16px",
              borderRadius: "var(--db-radius-card)",
              border: `2px solid ${menuMode === "external" ? "var(--db-accent)" : "var(--db-border)"}`,
              background: menuMode === "external" ? "rgba(var(--db-accent-rgb, 92 124 250) / 0.06)" : "var(--db-bg-elevated)",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="radio"
                name="menu_mode"
                value="external"
                checked={menuMode === "external"}
                onChange={() => setMenuMode("external")}
                style={{ accentColor: "var(--db-accent)", width: 16, height: 16, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--db-text-primary)" }}>
                  {t("menuModeExternalOptionTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginTop: 2 }}>
                  {t("menuModeExternalOptionDesc")}
                </div>
              </div>
            </div>

            {/* URL input — visible when external is selected */}
            {menuMode === "external" && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="url"
                    placeholder={t("menuModeUrlPlaceholder")}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "var(--db-radius)",
                      border: "1px solid var(--db-border)",
                      background: "var(--db-bg-card)",
                      color: "var(--db-text-primary)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveMenuMode("external")}
                    disabled={savingMode || !urlInput.trim()}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--db-radius)",
                      border: "none",
                      background: "var(--db-accent)",
                      color: "var(--db-accent-text)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: savingMode || !urlInput.trim() ? "not-allowed" : "pointer",
                      opacity: savingMode || !urlInput.trim() ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {savingMode ? t("menuModeSavingState") : tCommon("save")}
                  </button>
                </div>
                {externalMenuUrl && (
                  <a
                    href={externalMenuUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      color: "var(--db-accent)",
                      textDecoration: "underline",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {t("menuModeOpenLinkButton")}
                  </a>
                )}
              </div>
            )}
          </label>

          {/* Opción 2 — Menú Web propio */}
          <label
            style={{
              display: "block",
              padding: "14px 16px",
              borderRadius: "var(--db-radius-card)",
              border: `2px solid ${menuMode === "web" ? "var(--db-accent)" : "var(--db-border)"}`,
              background: menuMode === "web" ? "rgba(var(--db-accent-rgb, 92 124 250) / 0.06)" : "var(--db-bg-elevated)",
              cursor: savingMode ? "wait" : "pointer",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="radio"
                name="menu_mode"
                value="web"
                checked={menuMode === "web"}
                disabled={savingMode}
                onChange={() => void handleSaveMenuMode("web")}
                style={{ accentColor: "var(--db-accent)", width: 16, height: 16, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: menuMode === "web" ? "var(--db-accent)" : "var(--db-text-primary)" }}>
                  {t("menuModeWebOptionTitle")}
                </div>
                <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginTop: 2 }}>
                  {t("menuModeWebOptionDesc")}
                </div>
              </div>
            </div>
          </label>

          {/* Sin menú — opción para quitar */}
          {menuMode !== "none" && (
            <button
              type="button"
              onClick={() => void handleSaveMenuMode("none")}
              disabled={savingMode}
              style={{
                alignSelf: "flex-start",
                fontSize: 12,
                color: "var(--db-text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              {t("menuModeRemoveButton")}
            </button>
          )}
        </div>

        {/* Estado actual */}
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--db-text-tertiary)" }}>
          {t("menuModeCurrentStatusLabel")}{" "}
          <strong>
            {menuMode === "external" && externalMenuUrl
              ? t("menuModeExternalConfiguredState")
              : menuMode === "external"
              ? t("menuModeExternalNoUrlState")
              : menuMode === "web"
              ? t("menuModeWebActiveState")
              : t("menuModeNoneState")}
          </strong>
          {menuMode === "web" && bizSlug && (
            <span style={{ marginLeft: 10 }}>
              <a
                href={`/m/${bizSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--db-accent)", textDecoration: "none", fontWeight: 600 }}
              >
                {t("menuModeViewWebLinkButton")}
              </a>
            </span>
          )}
        </div>
      </div>

      {/* ── Plantilla de menú ──────────────────────────────────────────────── */}
      {menuMode === "web" && (
        <div
          style={{
            background: "var(--db-bg-card)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius-card)",
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            aria-expanded={showTemplates}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                {t("menuTemplateSectionTitle")}
              </h2>
              {showTemplates ? (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuTemplateSectionDesc")}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuTemplateActiveLabel")}{" "}
                  <strong style={{ color: "var(--db-text-primary)", fontWeight: 600 }}>
                    {templateLabels[menuTemplate] ?? menuTemplate}
                  </strong>
                </p>
              )}
            </div>
            <IconChevronDown
              size={20}
              style={{
                flexShrink: 0,
                marginTop: 2,
                color: "var(--db-text-tertiary)",
                transform: showTemplates ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showTemplates && (
          <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 16,
              marginTop: 16,
            }}
          >
            {MENU_TEMPLATE_OPTIONS.filter((opt) => !opt.hidden).map((opt) => {
              const active = menuTemplate === opt.id;
              const saving = savingTemplate === opt.id;
              const hovered = hoveredTemplate === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void handleSaveTemplate(opt.id)}
                  onMouseEnter={() => setHoveredTemplate(opt.id)}
                  onMouseLeave={() => setHoveredTemplate((h) => (h === opt.id ? null : h))}
                  disabled={savingTemplate !== null}
                  aria-pressed={active}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 8,
                    textAlign: "left",
                    borderRadius: "var(--db-radius-card)",
                    border: active
                      ? "2px solid var(--db-accent)"
                      : `1px solid ${hovered ? "var(--db-accent)" : "var(--db-border)"}`,
                    boxShadow: active ? "0 0 0 3px var(--db-accent-bg)" : "none",
                    background: "var(--db-bg-elevated)",
                    cursor: savingTemplate !== null ? "wait" : "pointer",
                    opacity: savingTemplate !== null && !saving && !active ? 0.6 : 1,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  {/* Miniatura de teléfono */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "3 / 4",
                      borderRadius: "var(--db-radius-card)",
                      overflow: "hidden",
                      background: "var(--db-bg-elevated)",
                    }}
                  >
                    <TemplateThumb
                      id={opt.id}
                      emoji={opt.emoji}
                      alt={t("menuTemplatePreviewAlt", { name: templateLabels[opt.id] ?? opt.id })}
                    />
                    {saving && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.45)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {t("menuTemplateSavingState")}
                      </div>
                    )}
                  </div>

                  {/* Nombre + descripción */}
                  <div style={{ minWidth: 0, padding: "0 2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--db-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {templateLabels[opt.id] ?? opt.id}
                      </span>
                      {active && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--db-accent)", flexShrink: 0 }}>
                          {t("menuTemplateActiveBadge")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--db-text-secondary)", marginTop: 2, lineHeight: 1.35 }}>
                      {templateDescs[opt.id] ?? opt.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {bizSlug && (
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--db-text-tertiary)" }}>
              {t.rich("menuTemplateViewPublicMessage", {
                link: (chunks) => (
                  <a
                    href={`/m/${bizSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--db-accent)", textDecoration: "none", fontWeight: 500 }}
                  >
                    {chunks}
                  </a>
                ),
              })}
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ── Paleta de colores ──────────────────────────────────────────────── */}
      {menuMode === "web" && (
        <div
          style={{
            background: "var(--db-bg-card)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius-card)",
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setShowPalettes((v) => !v)}
            aria-expanded={showPalettes}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                {t("menuPalettes.sectionTitle")}
              </h2>
              {showPalettes ? (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuPalettes.sectionDescription")}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuPalettes.activePaletteLabel")}{" "}
                  <strong style={{ color: "var(--db-text-primary)", fontWeight: 600 }}>
                    {menuPalette
                      ? paletteDisplayName(menuPalette, t)
                      : t("menuPalettes.originalTemplateOption")}
                  </strong>
                </p>
              )}
            </div>
            <IconChevronDown
              size={20}
              style={{
                flexShrink: 0,
                marginTop: 2,
                color: "var(--db-text-tertiary)",
                transform: showPalettes ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showPalettes && (
          <div style={{ marginTop: 16 }}>
            {/* Volver a la paleta original de la plantilla */}
            <button
              type="button"
              onClick={() => void handleSavePalette(null)}
              disabled={savingPalette !== null}
              aria-pressed={menuPalette === null}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "12px 14px",
                marginBottom: 20,
                borderRadius: "var(--db-radius-card)",
                textAlign: "left",
                border: menuPalette === null
                  ? "2px solid var(--db-accent)"
                  : "1px solid var(--db-border)",
                boxShadow: menuPalette === null ? "0 0 0 3px var(--db-accent-bg)" : "none",
                background: "var(--db-bg-elevated)",
                cursor: savingPalette !== null ? "wait" : "pointer",
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>↺</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--db-text-primary)" }}>
                  {t("menuPalettes.originalTemplateOption")}
                </div>
                <div style={{ fontSize: 11, color: "var(--db-text-secondary)", marginTop: 1 }}>
                  {t("menuPalettes.originalTemplateDescription", {
                    template:
                      MENU_TEMPLATE_OPTIONS.find((o) => o.id === menuTemplate)?.name ??
                      t("menuPalettes.genericTemplateFallback"),
                  })}
                </div>
              </div>
              {menuPalette === null && (
                <IconCheck size={16} style={{ color: "var(--db-accent)", flexShrink: 0 }} />
              )}
            </button>

            {/* Paletas agrupadas por familia */}
            {PALETTE_FAMILIES.map((fam) => {
              const palettes = COLOR_PALETTES.filter((p) => p.family === fam.key);
              if (palettes.length === 0) return null;
              return (
                <div key={fam.key} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--db-text-tertiary)",
                      marginBottom: 10,
                    }}
                  >
                    {t(`menuPalettes.families.${fam.key}`)}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {palettes.map((p) => {
                      const active = menuPalette === p.slug;
                      const saving = savingPalette === p.slug;
                      return (
                        <button
                          key={p.slug}
                          type="button"
                          onClick={() => void handleSavePalette(p.slug)}
                          disabled={savingPalette !== null}
                          aria-pressed={active}
                          title={t(`menuPalettes.names.${p.slug}`)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: 6,
                            textAlign: "left",
                            borderRadius: "var(--db-radius-card)",
                            border: active
                              ? "2px solid var(--db-accent)"
                              : "1px solid var(--db-border)",
                            boxShadow: active ? "0 0 0 3px var(--db-accent-bg)" : "none",
                            background: "var(--db-bg-elevated)",
                            cursor: savingPalette !== null ? "wait" : "pointer",
                            opacity: savingPalette !== null && !saving && !active ? 0.6 : 1,
                            transition: "border-color 0.15s, box-shadow 0.15s",
                          }}
                        >
                          {/* Mini-preview con la paleta real */}
                          <div
                            style={{
                              position: "relative",
                              background: p.bg,
                              borderRadius: "var(--db-radius)",
                              padding: 8,
                              height: 70,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              overflow: "hidden",
                            }}
                          >
                            {/* fila "tarjeta" con surface + nombre falso */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: p.surface,
                                borderRadius: "var(--db-radius)",
                                padding: "5px 7px",
                              }}
                            >
                              <span style={{ width: 26, height: 5, borderRadius: 3, background: p.text, opacity: 0.85, flexShrink: 0 }} />
                              <span style={{ width: 14, height: 5, borderRadius: 3, background: p.textMuted, opacity: 0.7 }} />
                            </div>
                            {/* fila precio (accent) + botón + */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: p.price }}>$12.00</span>
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 999,
                                  background: p.accent,
                                  color: p.accentText,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 13,
                                  fontWeight: 900,
                                  lineHeight: 1,
                                }}
                              >
                                +
                              </span>
                            </div>
                            {saving && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(0,0,0,0.45)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                {t("menuPalettes.savingOverlay")}
                              </div>
                            )}
                          </div>
                          {/* Nombre + check */}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 2px" }}>
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 600,
                                color: "var(--db-text-primary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}
                            >
                              {t(`menuPalettes.names.${p.slug}`)}
                            </span>
                            {active && (
                              <IconCheck size={12} style={{ color: "var(--db-accent)", flexShrink: 0, marginLeft: "auto" }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {bizSlug && (
              <div style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>
                <a
                  href={`/m/${bizSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--db-accent)", textDecoration: "none", fontWeight: 500 }}
                >
                  {t("menuPalettes.viewPublicMenuLink")}
                </a>
                {" "}{t("menuPalettes.viewPublicMenuSuffix")}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* ── Efecto de tarjetas ─────────────────────────────────────────────── */}
      {menuMode === "web" && (
        <div
          style={{
            background: "var(--db-bg-card)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius-card)",
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setShowEffects((v) => !v)}
            aria-expanded={showEffects}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                {t("menuEffectSectionTitle")}
              </h2>
              {showEffects ? (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuEffectSectionDesc")}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {t("menuEffectActiveLabel")}{" "}
                  <strong style={{ color: "var(--db-text-primary)", fontWeight: 600 }}>
                    {effectLabels[cardEffect] ?? cardEffect}
                  </strong>
                </p>
              )}
            </div>
            <IconChevronDown
              size={20}
              style={{
                flexShrink: 0,
                marginTop: 2,
                color: "var(--db-text-tertiary)",
                transform: showEffects ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showEffects && (
          <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              marginTop: 16,
            }}
          >
            {CARD_EFFECT_OPTIONS.map((opt) => {
              const active = cardEffect === opt.id;
              return (
                <label
                  key={opt.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--db-radius-card)",
                    border: `2px solid ${active ? "var(--db-accent)" : "var(--db-border)"}`,
                    background: active ? "rgba(var(--db-accent-rgb, 92 124 250) / 0.06)" : "var(--db-bg-elevated)",
                    cursor: savingEffect ? "wait" : "pointer",
                    transition: "border-color 0.15s",
                    opacity: savingEffect && !active ? 0.7 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="card_effect"
                    value={opt.id}
                    checked={active}
                    disabled={savingEffect}
                    onChange={() => void handleSaveCardEffect(opt.id)}
                    style={{ accentColor: "var(--db-accent)", width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{opt.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text-primary)" }}>
                      {effectLabels[opt.id] ?? opt.id}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--db-text-secondary)" }}>
                      {effectDescs[opt.id] ?? opt.desc}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {bizSlug && (
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--db-text-tertiary)" }}>
              {t.rich("menuEffectViewPublicMessage", {
                link: (chunks) => (
                  <a
                    href={`/m/${bizSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--db-accent)", textDecoration: "none", fontWeight: 500 }}
                  >
                    {chunks}
                  </a>
                ),
              })}
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ── Categorías del menú (encabezado + acción) ─────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            {t("menuCategoriesSectionTitle")}
          </h2>
          <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
            {t("menuCategoriesSectionDesc")}
          </p>
        </div>

        {!showCatForm && (
          <button
            onClick={() => {
              setShowCatForm(true);
              setEditingCatId(null);
              setCatFormInitial(EMPTY_CATEGORY_FORM);
              setError(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 18px",
              borderRadius: "var(--db-radius)",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <IconPlus size={16} />
            {t("menuAddCategoryButton")}
          </button>
        )}
      </div>

      {/* New / edit category form */}
      {showCatForm && (
        <div style={{ marginBottom: "20px" }}>
          <CategoryFormPanel
            initial={catFormInitial}
            onSave={handleSaveCategory}
            onCancel={() => {
              setShowCatForm(false);
              setEditingCatId(null);
              setCatFormInitial(EMPTY_CATEGORY_FORM);
            }}
            saving={savingCat}
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--db-text-tertiary)",
            fontSize: "14px",
          }}
        >
          {t("menuLoadingState")}
        </div>
      )}

      {/* Category cards selector — honest counts + warnings. Owns the empty /
          load-error states for categories (loading is handled above). */}
      {!loading && (
        <div style={{ marginBottom: "16px" }}>
          <CategoryCards
            cards={categoryCards}
            totalPublished={totalPublishedItems}
            activeId={activeCategoryId}
            onSelect={setActiveCategoryId}
            loadError={!!error && categories.length === 0}
            onRetry={() => void loadData()}
          />
        </div>
      )}

      {/* Categories */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {visibleCategories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              allCategories={sortedCategories}
              items={items.filter((it) => it.category_id === cat.id)}
              onMoveUp={(c) => void reorderCategory(c, "up")}
              onMoveDown={(c) => void reorderCategory(c, "down")}
              onEditCategory={(c) => {
                setEditingCatId(c.id);
                setCatFormInitial({ name: c.name, icon: c.icon ?? "", icon_url: c.icon_url ?? null });
                setShowCatForm(true);
                setError(null);
              }}
              onToggleCategoryPublish={(c) => void handleToggleCategoryPublish(c)}
              onDeleteCategory={(c) => void handleDeleteCategory(c)}
              onAddItem={openAddItem}
              onEditItem={openEditItem}
              onToggleItemPublish={(it) => void handleToggleItemPublish(it)}
              onDeleteItem={(it) => void handleDeleteItem(it)}
              togglingCat={togglingCatId === cat.id}
              togglingItem={togglingItemId}
              deletingItem={deletingItemId}
              savingItem={savingItem}
              activeItemEdit={
                activeItemEdit?.categoryId === cat.id ? activeItemEdit : null
              }
              onItemSave={handleSaveItem}
              onItemEditCancel={() => setActiveItemEdit(null)}
              isPro={bizPlan === "pro" && (bizPlanStatus === "active" || bizPlanStatus === "trialing")}
            />
          ))}
        </div>
      )}

      {/* Summary footer */}
      {!loading && sortedCategories.length > 0 && (
        <div
          style={{
            marginTop: "24px",
            padding: "12px 16px",
            background: "var(--db-bg-surface)",
            border: "1px solid var(--db-border)",
            borderRadius: "var(--db-radius)",
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
          }}
        >
          {[
            { label: t("menuFooterCategoriesLabel"), value: categories.length },
            {
              label: t("menuFooterPublishedCategoriesLabel"),
              value: categories.filter((c) => c.is_published).length,
            },
            { label: t("menuFooterTotalProductsLabel"), value: items.length },
            {
              label: t("menuFooterPublishedProductsLabel"),
              value: items.filter((it) => it.is_published).length,
            },
            {
              label: t("menuFooterHiddenProductsLabel"),
              value: items.filter((it) => !it.is_published).length,
            },
          ].map((s) => (
            <span key={s.label}>
              <strong style={{ color: "var(--db-text-primary)", marginRight: 4 }}>
                {s.value}
              </strong>
              {s.label}
            </span>
          ))}
        </div>
      )}
      </div>

      {bizSlug && menuMode !== "external" && (
        <aside className="hidden xl:block" style={{ flex: "0 0 auto", position: "sticky", top: 80 }}>
          {/* Label */}
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--db-text-secondary)" }}>
              Vista en vivo
            </span>
          </div>
          {/* iPhone chrome */}
          <div
            style={{
              background: "#1c1c1e",
              borderRadius: 50,
              padding: 14,
              boxShadow: "0 0 0 1.5px #444, 0 24px 64px rgba(0,0,0,0.55)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              width: 270,
            }}
          >
            {/* Dynamic island */}
            <div style={{ width: 88, height: 28, background: "#000", borderRadius: 20 }} />
            {/* Screen — direct render of MenuTemplateRenderer at 0.62 scale */}
            <div style={{ width: 242, height: 524, overflow: "hidden", borderRadius: 25, background: "#fff" }}>
              <div style={{ width: 390, height: Math.round(524 / 0.62), overflowY: "auto", transform: "scale(0.62)", transformOrigin: "top left" }}>
                <MenuPaletteContext.Provider value={previewData.previewPalette}>
                  <MenuTemplateRenderer
                    templateId={menuTemplate}
                    business={previewData.previewBusiness}
                    categories={previewData.previewCategories}
                    activeCategory={previewData.previewCategories[0]?.id ?? ""}
                    scrollToCategory={() => {}}
                    sectionRefs={previewSectionRefs}
                    onItemAdd={() => {}}
                    cartCount={0}
                    cartTotal={0}
                    onOpenCart={() => {}}
                    cardEffect={cardEffect}
                    hoveredCardId={null}
                    mousePos={{ mx: 0, my: 0 }}
                    onCardEnter={() => {}}
                    onCardLeave={() => {}}
                    onCardMove={() => {}}
                  />
                </MenuPaletteContext.Provider>
              </div>
            </div>
            {/* Home indicator */}
            <div style={{ width: 100, height: 4, background: "#555", borderRadius: 2 }} />
          </div>
        </aside>
      )}
    </div>
  );
}
