/**
 * JChat 3.0 — AI Menu Assistant wizard (steps 1–4)
 *
 * Guides a Pro owner from "what kind of business am I" to a reviewed list of
 * categories + items. Steps 1–3 never touch the database; step 4 is the ONLY
 * place that writes, and everything it inserts lands as a draft
 * (is_published = false) so the owner still decides what goes live.
 *
 * Steps
 *   1. Business  — type / what they sell / country + currency / price range
 *   2. Categories — AI suggestions (checkboxes) + "＋ add your own"
 *   3. Items      — lazy per-category suggest_items, editable price + station,
 *                   optional per-item refinement (sizes / extras)
 *   4. Preview    — read-only review of everything selected + "Create menu"
 *
 * Plan gate: the wizard is Pro-only. The lock screen below is a UX
 * convenience — the REAL gate lives server-side in the menu-assistant Edge
 * Function (requireProOwner), which refuses every action for a non-Pro owner.
 * When the plan is not 'pro' this page never calls the Edge Function at all.
 *
 * Edge Function calls: supabase.functions.invoke("menu-assistant", { body }) —
 * the same pattern as dashboard/payments (stripe-connect) and dashboard/billing
 * (subscriptions). invoke() attaches the signed-in user's access token as
 * `Authorization: Bearer …` automatically, which is the JWT the function needs.
 * Non-2xx replies arrive as FunctionsHttpError, whose real { error } body is
 * unwrapped with the shared readFunctionError() helper.
 *
 * Design: var(--db-*) tokens only, no hardcoded hex. Icons: @tabler/icons-react.
 * i18n: every string comes from the `menuAssistant` namespace.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBed,
  IconCheck,
  IconChefHat,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconCoffee,
  IconGlass,
  IconGlassCocktail,
  IconGlobe,
  IconLoader2,
  IconLock,
  IconMapPin,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconToolsKitchen2,
  IconTrash,
  IconTruck,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { resolveActiveBusiness } from "@/lib/business";
import { readFunctionError } from "@/lib/functionError";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type Station = "kitchen" | "bar";
type PriceRange = "$" | "$$" | "$$$";
/** Step 4 exists only as a FASE 4 placeholder for now. */
type WizardStep = 1 | 2 | 3 | 4;

interface SuggestedCategory {
  name: string;
  emoji?: string;
  rationale: string;
}

/** One choice inside a refined group. `price_delta_cents` is added to the item price. */
interface RefinedOptionRow {
  label: string;
  price_delta_cents: number;
}

/** A refinement group the owner can edit in place (add/remove options, delete group). */
interface MutableRefinedGroup {
  label: string;
  type: "single" | "multi";
  options: RefinedOptionRow[];
}

interface SuggestedItem {
  name: string;
  description_es: string;
  description_en: string;
  price_cents: number;
  station: Station;
  tags: string[];
  selected: boolean;
  /** Owner override, in whole currency units (not cents). */
  editedPrice?: number;
  editedStation?: Station;

  // ── Refinement (FASE 4) ──────────────────────────────────────────────────
  /** Inline refinement panel open/closed. */
  refineExpanded?: boolean;
  /** refine_item in flight. */
  refineLoading?: boolean;
  /** refine_item already resolved once — never call it again for this item. */
  refineLoaded?: boolean;
  refineError?: string;
  /** Editable groups shown as chips in the panel. */
  refinedGroups?: MutableRefinedGroup[];
  /** Saved result, already in the shape of `menu_items.options` (FASE 5 insert). */
  editedOptions?: {
    sizes: { label: string; price_cents: number }[];
    extras: { label: string; price_cents: number }[];
  };
  /** Raw `modifier_groups` rows from the Edge Function, kept verbatim. */
  modifier_groups?: unknown;
}

interface WizardState {
  step: WizardStep;
  // Step 1
  businessType: string;
  sells: string[];
  country: string;
  currency: string;
  priceRange: PriceRange;
  // Step 2
  suggestedCategories: SuggestedCategory[];
  selectedCategories: string[];
  customCategories: string[];
  // Step 3
  itemsByCategory: Record<string, SuggestedItem[]>;
  /** Categories whose suggest_items call already resolved (cache key). */
  loadedCategories: string[];
  customItems: Record<string, Array<{ name: string; price_cents: number }>>;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  businessType: "",
  sells: [],
  country: "",
  currency: "USD",
  priceRange: "$$",
  suggestedCategories: [],
  selectedCategories: [],
  customCategories: [],
  itemsByCategory: {},
  loadedCategories: [],
  customItems: {},
};

/** Preset business types. "other" opens a free-text input instead. */
const BUSINESS_TYPES = [
  { id: "restaurant", Icon: IconToolsKitchen2, labelKey: "typeRestaurant" },
  { id: "bar", Icon: IconGlassCocktail, labelKey: "typeBar" },
  { id: "cafe", Icon: IconCoffee, labelKey: "typeCafe" },
  { id: "hotel", Icon: IconBed, labelKey: "typeHotel" },
  { id: "food_truck", Icon: IconTruck, labelKey: "typeFoodTruck" },
];

/** Always shown in full — never filtered by business type (product decision). */
const SELL_OPTIONS = [
  { id: "menu_cocina", labelKey: "sellsMenuCocina" },
  { id: "room_service", labelKey: "sellsRoomService" },
  { id: "amenidades", labelKey: "sellsAmenidades" },
  { id: "minibar", labelKey: "sellsMinibar" },
] as const;

const PRICE_RANGES: PriceRange[] = ["$", "$$", "$$$"];

/** `menu_items.options` shape — the exact payload the manual editor persists. */
type ItemOptions = SuggestedItem["editedOptions"];

/**
 * Renders saved options back as one readable line per group.
 *
 * handleSaveRefine() flattens groups into `{ sizes, extras }` with labels of the
 * form `"<group>: <option>"`, so the group name is recovered from that prefix
 * and the options are rejoined — e.g. `"Tamaño: Chico · Mediano · Grande"`.
 * Rows without a prefix (or coming straight from the Edge Function) fall into a
 * single unnamed group.
 */
function formatOptionGroups(options: ItemOptions): string[] {
  if (!options) return [];
  const rows = [...(options.sizes ?? []), ...(options.extras ?? [])];
  if (rows.length === 0) return [];
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const sep = row.label.indexOf(": ");
    const groupLabel = sep > 0 ? row.label.slice(0, sep) : "";
    const optionLabel = sep > 0 ? row.label.slice(sep + 2) : row.label;
    groups.set(groupLabel, [...(groups.get(groupLabel) ?? []), optionLabel]);
  }
  return [...groups.entries()].map(([groupLabel, values]) =>
    groupLabel ? `${groupLabel}: ${values.join(" · ")}` : values.join(" · "),
  );
}

// ── Small shared UI pieces (token-only styling) ───────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--db-bg-card)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "20px 24px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--db-text-secondary)",
        marginBottom: "10px",
      }}
    >
      {children}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <IconLoader2 size={size} style={{ animation: "jc-spin 1s linear infinite" }} />
      <style>{"@keyframes jc-spin { to { transform: rotate(360deg); } }"}</style>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "var(--db-radius)",
        border: "1px solid var(--db-danger)",
        color: "var(--db-danger)",
        background: "var(--db-bg-elevated)",
        fontSize: "13px",
        lineHeight: 1.5,
        marginBottom: "16px",
      }}
    >
      {message}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "11px 22px",
        borderRadius: "var(--db-radius)",
        border: "none",
        background: disabled ? "var(--db-bg-elevated)" : "var(--db-accent)",
        color: disabled ? "var(--db-text-tertiary)" : "var(--db-accent-text)",
        fontSize: "14px",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.15s ease, background 0.15s ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "11px 18px",
        borderRadius: "var(--db-radius)",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        color: "var(--db-text-secondary)",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "border-color 0.15s ease, color 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--db-radius)",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-elevated)",
  color: "var(--db-text-primary)",
  fontSize: "14px",
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 16px",
        borderRadius: "999px",
        border: selected ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
        background: selected ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
        color: selected ? "var(--db-accent)" : "var(--db-text-secondary)",
        fontSize: "13px",
        fontWeight: selected ? 700 : 500,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

// ── Plan gate screen ──────────────────────────────────────────────────────────

function LockedScreen() {
  const t = useTranslations("menuAssistant");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "55vh",
        gap: "16px",
        textAlign: "center",
        padding: "0 16px",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "64px",
          height: "64px",
          borderRadius: "18px",
          background: "var(--db-accent-bg)",
          color: "var(--db-accent)",
        }}
      >
        <IconLock size={32} />
      </span>
      <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--db-text-primary)", margin: 0 }}>
        {t("lockedTitle")}
      </h2>
      <p
        style={{
          fontSize: "14px",
          color: "var(--db-text-secondary)",
          maxWidth: "460px",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {t("lockedDescription")}
      </p>
      <Link
        href="/dashboard/billing"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 26px",
          borderRadius: "var(--db-radius)",
          background: "var(--db-accent)",
          color: "var(--db-accent-text)",
          fontSize: "14px",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {t("lockedCta")}
        <IconArrowRight size={16} />
      </Link>
      <Link
        href="/dashboard/menu"
        style={{ fontSize: "13px", color: "var(--db-text-tertiary)", textDecoration: "none" }}
      >
        {t("backToMenu")}
      </Link>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
  const t = useTranslations("menuAssistant");
  const labels = [t("stepBusiness"), t("stepCategories"), t("stepItems"), t("stepRefine")];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        marginBottom: "32px",
        overflow: "hidden",
      }}
    >
      {labels.map((label, i) => {
        const n = (i + 1) as WizardStep;
        const done = n < step;
        const active = n === step;
        return (
          <React.Fragment key={label}>
            {/* Step node */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "7px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active || done ? "var(--db-accent)" : "var(--db-bg-elevated)",
                  border: active || done ? "2px solid var(--db-accent)" : "2px solid var(--db-border)",
                  color: active || done ? "var(--db-accent-text)" : "var(--db-text-tertiary)",
                  fontSize: "13px",
                  fontWeight: 700,
                  transition: "all 0.25s ease",
                  flexShrink: 0,
                }}
              >
                {done ? <IconCheck size={15} /> : n}
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: active ? 700 : 500,
                  color: active
                    ? "var(--db-accent)"
                    : done
                    ? "var(--db-text-secondary)"
                    : "var(--db-text-tertiary)",
                  whiteSpace: "nowrap",
                  transition: "color 0.25s ease",
                  maxWidth: "72px",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            </div>
            {/* Connector line between steps */}
            {i < labels.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: "2px",
                  marginTop: "16px",
                  background: n < step ? "var(--db-accent)" : "var(--db-border)",
                  transition: "background 0.3s ease",
                  minWidth: "16px",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MenuAssistantPage() {
  const t = useTranslations("menuAssistant");

  // Business resolution + plan gate
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [noBusiness, setNoBusiness] = useState(false);

  // Wizard data — one state object, as specced.
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  // Ephemeral UI state (not part of the wizard payload)
  const [customTypeMode, setCustomTypeMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [newItemDraft, setNewItemDraft] = useState<Record<string, { name: string; price: string }>>({});

  // Refinement panel inputs (FASE 4) — purely ephemeral, never part of the wizard
  // payload. Key = `${categoryName}|||${itemIndex}|||${groupIndex}`; the presence
  // of a key means the mini-input for that group is open.
  const [newOptInputs, setNewOptInputs] = useState<Record<string, { label: string; delta: string }>>({});
  // Key = `${categoryName}|||${itemIndex}` — the "add group" form of that item.
  const [addingGroupMap, setAddingGroupMap] = useState<
    Record<string, { label: string; type: "single" | "multi"; show: boolean }>
  >({});

  // Step 4 — persistence. Local to the page on purpose: the wizard payload
  // (WizardState) describes what the owner chose, not what already reached the
  // database. `createSuccess` is a one-way latch: once the menu exists, the
  // button is gone and the only way back is the menu editor.
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<{
    categoryCount: number;
    itemCount: number;
    createdItems: Array<{ id: string; name: string; description_es: string }>;
    /** IDs of categories actually inserted this run (not reused ones). */
    newCategoryIds: string[];
    /** IDs of all menu_items inserted this run. */
    allItemIds: string[];
  } | null>(null);

  // Publish decision (shown on final success screen)
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{ items: number; categories: number } | null>(null);

  // FASE 6 — photo step (only active after createSuccess is set)
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photoPhase, setPhotoPhase] = useState<"photos" | "done">("photos");
  const [itemGalleries, setItemGalleries] = useState<Record<string, string[]>>({});
  const [itemPortadas, setItemPortadas] = useState<Record<string, string>>({});
  const [aiCandidates, setAiCandidates] = useState<Record<string, string[]>>({});
  const [aiGenerating, setAiGenerating] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoSaveError, setPhotoSaveError] = useState<string | null>(null);

  // ── Boot: resolve the active business, its plan and its country ─────────────
  useEffect(() => {
    let alive = true;

    async function boot() {
      if (!isSupabaseConfigured) {
        // Demo mode mirrors isBusinessPro(): treat as Pro so the UI is reviewable.
        if (alive) {
          setPlan("pro");
          setBootLoading(false);
        }
        return;
      }
      const res = await resolveActiveBusiness();
      if (!alive) return;
      if (!res.ok) {
        if (res.reason === "no_business" || res.reason === "unauthenticated") setNoBusiness(true);
        else setError(res.message);
        setBootLoading(false);
        return;
      }
      setBusinessId(res.business.id);
      setPlan(res.business.plan);

      // resolveActiveBusiness() doesn't select country — read it separately so
      // step 1 can prefill it. There is no per-business currency column, so the
      // currency default stays USD (see lib/currency.ts).
      const { data } = await supabase
        .from("businesses")
        .select("country")
        .eq("id", res.business.id)
        .maybeSingle();
      if (!alive) return;
      const country = (data as { country?: string } | null)?.country;
      if (country) setState((s) => ({ ...s, country }));
      setBootLoading(false);
    }

    void boot();
    return () => {
      alive = false;
    };
  }, []);

  const isPro = plan === "pro";

  // ── Edge Function caller ───────────────────────────────────────────────────
  // Same pattern as dashboard/payments + dashboard/billing: invoke() signs the
  // request with the user's access token; a non-2xx becomes FunctionsHttpError
  // whose { error } body readFunctionError() unwraps.
  const callAssistant = useCallback(
    async <T,>(action: string, params: Record<string, unknown>): Promise<T> => {
      const { data, error: fnError } = await supabase.functions.invoke("menu-assistant", {
        body: { action, business_id: businessId, ...params },
      });
      if (fnError) throw new Error(await readFunctionError(fnError));
      const payload = data as ({ ok?: boolean; error?: string } & T) | null;
      if (!payload || payload.ok !== true) {
        throw new Error(payload?.error ?? t("errorGeneric"));
      }
      return payload as T;
    },
    [businessId, t],
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  /** Categories in step-2 display order, filtered to the selected ones. */
  const orderedSelectedCategories = useMemo(() => {
    const all = [...state.suggestedCategories.map((c) => c.name), ...state.customCategories];
    return all.filter((name) => state.selectedCategories.includes(name));
  }, [state.suggestedCategories, state.customCategories, state.selectedCategories]);

  const totalSelectedItems = useMemo(
    () =>
      Object.values(state.itemsByCategory).reduce(
        (sum, list) => sum + list.filter((i) => i.selected).length,
        0,
      ),
    [state.itemsByCategory],
  );

  const step1Ready =
    state.businessType.trim().length > 0 &&
    state.sells.length > 0 &&
    state.country.trim().length > 0 &&
    state.priceRange.length > 0;

  // ── Step 1 → suggest_categories ────────────────────────────────────────────
  const handleGenerateCategories = useCallback(async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await callAssistant<{ categories: Array<{ name: string; emoji: string | null; rationale: string }> }>(
        "suggest_categories",
        {
          business_type: state.businessType,
          sells: state.sells,
          country: state.country,
          currency: state.currency,
          price_range: state.priceRange,
        },
      );
      const categories: SuggestedCategory[] = res.categories.map((c) => ({
        name: c.name,
        emoji: c.emoji ?? undefined,
        rationale: c.rationale,
      }));
      setState((s) => ({
        ...s,
        step: 2,
        suggestedCategories: categories,
        // Everything is checked by default.
        selectedCategories: [...categories.map((c) => c.name), ...s.customCategories],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setGenerating(false);
    }
  }, [callAssistant, state.businessType, state.sells, state.country, state.currency, state.priceRange, t]);

  // ── Step 3 → suggest_items (lazy, cached per category) ─────────────────────
  const loadItemsFor = useCallback(
    async (categoryName: string) => {
      if (state.loadedCategories.includes(categoryName)) return;
      setError(null);
      setLoadingCategory(categoryName);
      try {
        const res = await callAssistant<{
          items: Array<{
            name: string;
            description_es: string;
            description_en: string;
            price_cents: number;
            station: Station;
            tags: string[];
          }>;
        }>("suggest_items", {
          business_type: state.businessType,
          country: state.country,
          currency: state.currency,
          price_range: state.priceRange,
          category_name: categoryName,
        });
        const items: SuggestedItem[] = res.items.map((i) => ({ ...i, selected: true }));
        setState((s) => ({
          ...s,
          // Keep any custom items the owner already added to this category.
          itemsByCategory: { ...s.itemsByCategory, [categoryName]: [...(s.itemsByCategory[categoryName] ?? []), ...items] },
          loadedCategories: [...s.loadedCategories, categoryName],
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      } finally {
        setLoadingCategory(null);
      }
    },
    [callAssistant, state.loadedCategories, state.businessType, state.country, state.currency, state.priceRange, t],
  );

  const toggleCategoryPanel = useCallback(
    (name: string) => {
      if (expandedCategory === name) {
        setExpandedCategory(null);
        return;
      }
      setExpandedCategory(name);
      void loadItemsFor(name);
    },
    [expandedCategory, loadItemsFor],
  );

  // ── Item mutators ──────────────────────────────────────────────────────────
  /**
   * Patch one item. `patch` is either a plain partial or a function of the
   * current item — the functional form is what the refinement helpers need to
   * derive the next `refinedGroups` from the previous ones without reading
   * stale state.
   */
  const updateItem = useCallback(
    (
      category: string,
      index: number,
      patch: Partial<SuggestedItem> | ((item: SuggestedItem) => Partial<SuggestedItem>),
    ) => {
      setState((s) => {
        const list = s.itemsByCategory[category];
        if (!list) return s;
        const next = list.map((it, i) =>
          i === index ? { ...it, ...(typeof patch === "function" ? patch(it) : patch) } : it,
        );
        return { ...s, itemsByCategory: { ...s.itemsByCategory, [category]: next } };
      });
    },
    [],
  );

  const addCustomItem = useCallback(
    (category: string) => {
      const draft = newItemDraft[category];
      const name = draft?.name.trim() ?? "";
      if (!name) return;
      const priceUnits = Number.parseFloat(draft?.price ?? "");
      const priceCents = Number.isFinite(priceUnits) ? Math.max(0, Math.round(priceUnits * 100)) : 0;
      setState((s) => {
        const entry: SuggestedItem = {
          name,
          description_es: "",
          description_en: "",
          price_cents: priceCents,
          station: "kitchen",
          tags: [],
          selected: true,
        };
        return {
          ...s,
          // Rendered from itemsByCategory (one list to draw); customItems keeps
          // the separate record of what the owner typed, for FASE 5 insertion.
          itemsByCategory: { ...s.itemsByCategory, [category]: [...(s.itemsByCategory[category] ?? []), entry] },
          customItems: {
            ...s.customItems,
            [category]: [...(s.customItems[category] ?? []), { name, price_cents: priceCents }],
          },
        };
      });
      setNewItemDraft((d) => ({ ...d, [category]: { name: "", price: "" } }));
    },
    [newItemDraft],
  );

  // ── Refinement (FASE 4) ────────────────────────────────────────────────────
  //
  // Refining is OPTIONAL and per item: an item the owner never expands keeps
  // exactly the shape it had after step 3. The refine_item response is cached
  // on the item itself (refineLoaded) so reopening the panel never re-bills a
  // model call.

  const handleOpenRefine = useCallback(
    async (categoryName: string, index: number, item: SuggestedItem) => {
      // Toggle close
      if (item.refineExpanded) {
        updateItem(categoryName, index, { refineExpanded: false });
        return;
      }
      // Open
      updateItem(categoryName, index, { refineExpanded: true });
      // Already loaded → just show what we have (edits included)
      if (item.refineLoaded) return;

      updateItem(categoryName, index, { refineLoading: true, refineError: undefined });
      try {
        const result = await callAssistant<{
          groups: MutableRefinedGroup[];
          options: {
            sizes: { label: string; price_cents: number }[];
            extras: { label: string; price_cents: number }[];
          };
          modifier_groups: unknown;
        }>("refine_item", {
          item_name: item.name,
          category_name: categoryName,
          business_type: state.businessType,
          country: state.country,
        });
        updateItem(categoryName, index, {
          refineLoading: false,
          refineLoaded: true,
          refinedGroups: result.groups ?? [],
          modifier_groups: result.modifier_groups,
          // The EF already returns `options` in the manual-editor shape; keep it
          // as the initial saved value so an untouched panel is still usable.
          editedOptions: result.options,
        });
      } catch (err) {
        updateItem(categoryName, index, {
          refineLoading: false,
          refineError: err instanceof Error ? err.message : t("refineError"),
        });
      }
    },
    [state.businessType, state.country, callAssistant, updateItem, t],
  );

  /** groups → { sizes, extras }: the exact shape of `menu_items.options`. */
  const handleSaveRefine = useCallback(
    (categoryName: string, index: number, item: SuggestedItem) => {
      const groups = item.refinedGroups ?? [];
      const sizes: { label: string; price_cents: number }[] = [];
      const extras: { label: string; price_cents: number }[] = [];
      for (const g of groups) {
        for (const opt of g.options) {
          const row = { label: `${g.label}: ${opt.label}`, price_cents: opt.price_delta_cents };
          if (g.type === "single") sizes.push(row);
          else extras.push(row);
        }
      }
      updateItem(categoryName, index, {
        editedOptions: { sizes, extras },
        refineExpanded: false,
      });
    },
    [updateItem],
  );

  const addOptionToGroup = useCallback(
    (categoryName: string, itemIdx: number, groupIdx: number, opt: RefinedOptionRow) => {
      updateItem(categoryName, itemIdx, (item: SuggestedItem) => ({
        refinedGroups: (item.refinedGroups ?? []).map((g, gi) =>
          gi === groupIdx ? { ...g, options: [...g.options, opt] } : g,
        ),
      }));
    },
    [updateItem],
  );

  const removeOptionFromGroup = useCallback(
    (categoryName: string, itemIdx: number, groupIdx: number, optIdx: number) => {
      updateItem(categoryName, itemIdx, (item: SuggestedItem) => ({
        refinedGroups: (item.refinedGroups ?? []).map((g, gi) =>
          gi === groupIdx ? { ...g, options: g.options.filter((_, oi) => oi !== optIdx) } : g,
        ),
      }));
    },
    [updateItem],
  );

  const addGroup = useCallback(
    (categoryName: string, itemIdx: number, group: MutableRefinedGroup) => {
      updateItem(categoryName, itemIdx, (item: SuggestedItem) => ({
        refinedGroups: [...(item.refinedGroups ?? []), group],
      }));
    },
    [updateItem],
  );

  const removeGroup = useCallback(
    (categoryName: string, itemIdx: number, groupIdx: number) => {
      updateItem(categoryName, itemIdx, (item: SuggestedItem) => ({
        refinedGroups: (item.refinedGroups ?? []).filter((_, gi) => gi !== groupIdx),
      }));
    },
    [updateItem],
  );

  // ── Step 4 → create the menu (the only DB write in the wizard) ─────────────
  //
  // Insert order matters: categories first (so every item has a category_id),
  // then the items of each category. A category whose name already exists for
  // this business is REUSED rather than duplicated — running the wizard twice
  // must not leave the owner with two "Bebidas".
  //
  // Everything is inserted with is_published = false. The owner reviews the
  // draft in /dashboard/menu and publishes there.
  const handleCreateMenu = useCallback(async () => {
    if (!businessId) return;
    setCreating(true);
    setCreateError(null);
    // Reset photo + publish state in case the user somehow re-runs (shouldn't happen — button disappears on success).
    setPhotoIdx(0);
    setPhotoPhase("photos");
    setItemGalleries({});
    setItemPortadas({});
    setAiCandidates({});
    setAiErrors({});
    setPublishResult(null);
    setPublishError(null);
    try {
      // 1. Existing categories → name (case-insensitive) → id, so we can reuse.
      const { data: existingCats, error: catsErr } = await supabase
        .from("menu_categories")
        .select("id, name")
        .eq("business_id", businessId)
        .order("sort", { ascending: true });
      if (catsErr) throw catsErr;

      const existingByName = new Map<string, string>(
        (existingCats ?? []).map((c: { id: string; name: string }) => [c.name.trim().toLowerCase(), c.id]),
      );

      // New categories are appended after whatever the owner already had.
      const baseSort = (existingCats ?? []).length;

      // 2. Create the missing categories and resolve every id.
      const categoryIdMap = new Map<string, string>();
      // Track IDs of categories actually inserted this run (not reused) so the
      // publish step knows exactly which rows to flip to is_published = true.
      const newCategoryIds: string[] = [];
      let newCatCount = 0;
      for (const catName of state.selectedCategories) {
        const key = catName.trim().toLowerCase();
        const existingId = existingByName.get(key);
        if (existingId) {
          categoryIdMap.set(catName, existingId);
        } else {
          const { data: newCat, error: catErr } = await supabase
            .from("menu_categories")
            .insert({
              business_id: businessId,
              name: catName.trim(),
              sort: baseSort + newCatCount,
              is_published: false,
            } as never)
            .select("id")
            .single();
          if (catErr) throw catErr;
          const newCatId = (newCat as { id: string }).id;
          categoryIdMap.set(catName, newCatId);
          newCategoryIds.push(newCatId);
          newCatCount++;
        }
      }

      // 3. Insert the selected items of each category.
      let itemCount = 0;
      const createdItems: Array<{ id: string; name: string; description_es: string }> = [];
      // All item IDs from this run — used by the publish step.
      const allItemIds: string[] = [];
      for (const catName of state.selectedCategories) {
        const catId = categoryIdMap.get(catName);
        if (!catId) continue;
        const items = (state.itemsByCategory[catName] ?? []).filter((it) => it.selected);
        if (items.length === 0) continue;

        // Append after the category's current items (relevant when the category
        // was reused instead of created).
        const { data: existingItems } = await supabase
          .from("menu_items")
          .select("sort")
          .eq("category_id", catId)
          .order("sort", { ascending: false })
          .limit(1);
        let nextSort = ((existingItems?.[0] as { sort?: number } | undefined)?.sort ?? -1) + 1;

        for (const item of items) {
          const priceCents =
            item.editedPrice != null ? Math.round(item.editedPrice * 100) : item.price_cents;

          const dbPayload = {
            business_id: businessId,
            category_id: catId,
            name: item.name,
            description: item.description_es || null,
            description_alt: item.description_en || null,
            price_cents: priceCents,
            station: item.editedStation ?? item.station,
            dietary_tags: item.tags,
            // Items the owner never refined save the empty shape the manual
            // editor also writes, so both paths produce identical rows.
            options: (item.editedOptions ?? { sizes: [], extras: [] }) as unknown as Json,
            is_published: false,
            is_available: true,
            sort: nextSort,
          };
          const { data: newItem, error: itemErr } = await supabase
            .from("menu_items")
            .insert(dbPayload as never)
            .select("id")
            .single();
          if (itemErr) throw itemErr;
          const newItemId = (newItem as { id: string }).id;
          createdItems.push({
            id: newItemId,
            name: item.name,
            description_es: item.description_es || "",
          });
          allItemIds.push(newItemId);
          nextSort++;
          itemCount++;
        }
      }

      setCreateSuccess({ categoryCount: newCatCount, itemCount, createdItems, newCategoryIds, allItemIds });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }, [businessId, state.selectedCategories, state.itemsByCategory]);

  // ── FASE 6 — Photo step handlers ──────────────────────────────────────────

  /** Upload local files for an item and add public URLs to its gallery. */
  const handlePhotoUpload = useCallback(
    async (itemId: string, files: FileList) => {
      if (!businessId) return;
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${businessId}/${itemId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("menu-photos")
          .upload(path, file, { upsert: false });
        if (!error) {
          const { data: urlData } = supabase.storage
            .from("menu-photos")
            .getPublicUrl(path);
          uploaded.push(urlData.publicUrl);
        }
      }
      if (uploaded.length > 0) {
        setItemGalleries((prev) => ({
          ...prev,
          [itemId]: [...(prev[itemId] ?? []), ...uploaded],
        }));
      }
    },
    [businessId],
  );

  /** Call generate_images EF and store AI-generated candidates for the item. */
  const handlePhotoGenerate = useCallback(
    async (itemId: string, itemName: string, description: string) => {
      // Clear any previous error for this item before each attempt.
      setAiErrors((prev) => {
        if (!prev[itemId]) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setAiGenerating((prev) => ({ ...prev, [itemId]: true }));
      try {
        const result = await callAssistant<{ ok: boolean; images: string[] }>(
          "generate_images",
          { item_name: itemName, description: description || undefined, count: 5 },
        );
        if (result?.ok && result.images?.length) {
          setAiCandidates((prev) => ({
            ...prev,
            [itemId]: [...(prev[itemId] ?? []), ...result.images],
          }));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setAiErrors((prev) => ({ ...prev, [itemId]: msg }));
      } finally {
        setAiGenerating((prev) => ({ ...prev, [itemId]: false }));
      }
    },
    [callAssistant],
  );

  /** Toggle a candidate URL into the item's gallery. */
  const handleAddCandidateToGallery = useCallback((itemId: string, url: string) => {
    setItemGalleries((prev) => {
      const existing = prev[itemId] ?? [];
      if (existing.includes(url)) {
        // deselect
        return { ...prev, [itemId]: existing.filter((u) => u !== url) };
      }
      return { ...prev, [itemId]: [...existing, url] };
    });
  }, []);

  /** Mark a photo as the portada (cover). */
  const handleSetPortada = useCallback((itemId: string, url: string) => {
    setItemPortadas((prev) => ({ ...prev, [itemId]: url }));
  }, []);

  /** Remove a photo from the gallery and clear portada if it was the cover. */
  const handleRemovePhoto = useCallback((itemId: string, url: string) => {
    setItemGalleries((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter((u) => u !== url),
    }));
    setItemPortadas((prev) => {
      if (prev[itemId] !== url) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  /** Advance to the next item (or done). */
  const advancePhoto = useCallback(
    (target?: number) => {
      const items = createSuccess?.createdItems ?? [];
      const next = target ?? photoIdx + 1;
      if (next >= items.length) {
        setPhotoPhase("done");
      } else {
        setPhotoIdx(next);
      }
    },
    [createSuccess, photoIdx],
  );

  /**
   * Save current item's photos then advance.
   *
   * Writes to `menu_item_photos` (one row per photo, sort = index).
   * Keeps `menu_items.photo_url` in sync with the cover photo.
   * Deletes any rows already in `menu_item_photos` for this item before
   * inserting so a retry never produces duplicates.
   * Does NOT write `menu_items.images` (legacy column — abandoned).
   */
  const handleSaveAndAdvance = useCallback(
    async (itemId: string) => {
      setPhotoSaving(true);
      setPhotoSaveError(null);
      try {
        const gallery = itemGalleries[itemId] ?? [];
        const portada = itemPortadas[itemId] ?? gallery[0] ?? null;

        // 1. Remove any previous photos for this item (idempotent retry-safe).
        const { error: delErr } = await supabase
          .from("menu_item_photos")
          .delete()
          .eq("menu_item_id", itemId);
        if (delErr) throw new Error(delErr.message);

        // 2. Insert gallery rows — one per photo, sort = position index.
        if (gallery.length > 0 && businessId) {
          const rows = gallery.map((url, sort) => ({
            menu_item_id: itemId,
            business_id: businessId,
            url,
            sort,
          }));
          const { error: insertErr } = await supabase
            .from("menu_item_photos")
            .insert(rows as never);
          if (insertErr) throw new Error(insertErr.message);
        }

        // 3. Sync cover to menu_items.photo_url (kept for backwards compat).
        const { error: updateErr } = await supabase
          .from("menu_items")
          .update({ photo_url: portada } as never)
          .eq("id", itemId);
        if (updateErr) throw new Error(updateErr.message);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setPhotoSaveError(msg);
        return; // stay on this item so the user can retry
      } finally {
        setPhotoSaving(false);
      }
      advancePhoto();
    },
    [businessId, itemGalleries, itemPortadas, advancePhoto],
  );

  /** Publish all categories and items created in this wizard run. */
  const handlePublishMenu = useCallback(async () => {
    if (!createSuccess) return;
    setPublishLoading(true);
    setPublishError(null);
    try {
      const { newCategoryIds, allItemIds } = createSuccess;

      if (newCategoryIds.length > 0) {
        const { error: catErr } = await supabase
          .from("menu_categories")
          .update({ is_published: true } as never)
          .in("id", newCategoryIds);
        if (catErr) throw new Error(catErr.message);
      }

      if (allItemIds.length > 0) {
        const { error: itemErr } = await supabase
          .from("menu_items")
          .update({ is_published: true } as never)
          .in("id", allItemIds);
        if (itemErr) throw new Error(itemErr.message);
      }

      setPublishResult({
        categories: newCategoryIds.length,
        items: allItemIds.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPublishError(msg);
    } finally {
      setPublishLoading(false);
    }
  }, [createSuccess]);

  // ── Render guards ──────────────────────────────────────────────────────────

  if (bootLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--db-text-secondary)", fontSize: "14px" }}>
        <Spinner />
        {t("loading")}
      </div>
    );
  }

  if (noBusiness) {
    return (
      <div style={{ maxWidth: 880 }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          {t("title")}
        </h1>
        <NoBusinessCTA message={t("noBusinessMessage")} />
      </div>
    );
  }

  if (!isPro) return <LockedScreen />;

  // ── Wizard ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/dashboard/menu"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--db-text-tertiary)",
            textDecoration: "none",
            marginBottom: "10px",
          }}
        >
          <IconArrowLeft size={15} />
          {t("backToMenu")}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
            {t("title")}
          </h1>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              background: "var(--db-accent-bg)",
              color: "var(--db-accent)",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {t("proBadge")}
          </span>
        </div>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: "6px 0 0", lineHeight: 1.5 }}>
          {t("subtitle")}
        </p>
      </div>

      <Stepper step={state.step} />

      {error && <ErrorBanner message={error} />}

      {/* ── Step 1 — Business ─────────────────────────────────────────────── */}
      {state.step === 1 && (
        <Card>
          {/* Business type */}
          <FieldLabel>{t("businessTypeLabel")}</FieldLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            {BUSINESS_TYPES.map((bt) => {
              const selected = !customTypeMode && state.businessType === bt.id;
              return (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => {
                    setCustomTypeMode(false);
                    setState((s) => ({ ...s, businessType: bt.id }));
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                    padding: "20px 12px 16px",
                    borderRadius: "12px",
                    border: selected ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                    background: selected ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                    color: selected ? "var(--db-accent)" : "var(--db-text-secondary)",
                    fontSize: "13px",
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <bt.Icon size={28} />
                  {t(bt.labelKey)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setCustomTypeMode(true);
                setState((s) => ({ ...s, businessType: "" }));
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "20px 12px 16px",
                borderRadius: "12px",
                border: customTypeMode ? "2px solid var(--db-accent)" : "1px dashed var(--db-border)",
                background: customTypeMode ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                color: customTypeMode ? "var(--db-accent)" : "var(--db-text-tertiary)",
                fontSize: "13px",
                fontWeight: customTypeMode ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <IconPlus size={24} />
              {t("typeOther")}
            </button>
          </div>
          {customTypeMode && (
            <input
              type="text"
              value={state.businessType}
              onChange={(e) => setState((s) => ({ ...s, businessType: e.target.value }))}
              placeholder={t("typeOtherPlaceholder")}
              style={{ ...inputStyle, marginBottom: "20px" }}
            />
          )}

          {/* What do you sell */}
          <div style={{ marginTop: customTypeMode ? 0 : "20px" }}>
            <FieldLabel>{t("sellsLabel")}</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {SELL_OPTIONS.map((opt) => {
                const selected = state.sells.includes(opt.id);
                return (
                  <Chip
                    key={opt.id}
                    selected={selected}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        sells: selected ? s.sells.filter((v) => v !== opt.id) : [...s.sells, opt.id],
                      }))
                    }
                  >
                    {selected && <IconCheck size={14} />}
                    {t(opt.labelKey)}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* Country + currency */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginTop: "20px",
            }}
          >
            <div>
              <FieldLabel>{t("countryLabel")}</FieldLabel>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--db-text-tertiary)",
                    display: "flex",
                    pointerEvents: "none",
                  }}
                >
                  <IconMapPin size={16} />
                </span>
                <input
                  type="text"
                  value={state.country}
                  onChange={(e) => setState((s) => ({ ...s, country: e.target.value }))}
                  placeholder={t("countryPlaceholder")}
                  style={{ ...inputStyle, paddingLeft: "32px" }}
                />
              </div>
            </div>
            <div>
              <FieldLabel>{t("currencyLabel")}</FieldLabel>
              <input
                type="text"
                value={state.currency}
                onChange={(e) => setState((s) => ({ ...s, currency: e.target.value }))}
                placeholder={t("currencyPlaceholder")}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Price range — segmented control */}
          <div style={{ marginTop: "20px" }}>
            <FieldLabel>{t("priceRangeLabel")}</FieldLabel>
            <div
              style={{
                display: "inline-flex",
                borderRadius: "var(--db-radius)",
                border: "1px solid var(--db-border)",
                overflow: "hidden",
              }}
            >
              {PRICE_RANGES.map((pr, i) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => setState((s) => ({ ...s, priceRange: pr }))}
                  style={{
                    padding: "10px 24px",
                    border: "none",
                    borderLeft: i > 0 ? "1px solid var(--db-border)" : "none",
                    background: state.priceRange === pr ? "var(--db-accent)" : "var(--db-bg-elevated)",
                    color: state.priceRange === pr ? "var(--db-accent-text)" : "var(--db-text-secondary)",
                    fontSize: "14px",
                    fontWeight: state.priceRange === pr ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {pr}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "8px 0 0" }}>
              {t("priceRangeHint")}
            </p>
          </div>

          {/* Generate */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
            <PrimaryButton onClick={() => void handleGenerateCategories()} disabled={!step1Ready || generating}>
              {generating ? <Spinner /> : <IconSparkles size={17} />}
              {t("generateButton")}
            </PrimaryButton>
            {generating && (
              <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
                {t("generatingCategories")}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* ── Step 2 — Categories ───────────────────────────────────────────── */}
      {state.step === 2 && (
        <Card>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
            {t("categoriesTitle")}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
            {t("categoriesSubtitle")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              ...state.suggestedCategories,
              ...state.customCategories.map((name): SuggestedCategory => ({ name, rationale: "" })),
            ].map((cat) => {
              const checked = state.selectedCategories.includes(cat.name);
              return (
                <label
                  key={cat.name}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "13px 16px",
                    borderRadius: "12px",
                    border: checked ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                    background: checked ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setState((s) => ({
                        ...s,
                        selectedCategories: checked
                          ? s.selectedCategories.filter((n) => n !== cat.name)
                          : [...s.selectedCategories, cat.name],
                      }))
                    }
                    style={{ marginTop: "3px", accentColor: "var(--db-accent)", cursor: "pointer" }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                      {cat.emoji ? `${cat.emoji} ` : ""}
                      {cat.name}
                    </span>
                    {cat.rationale && (
                      <span
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: "var(--db-text-tertiary)",
                          marginTop: "3px",
                          lineHeight: 1.45,
                        }}
                      >
                        {cat.rationale}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Add your own */}
          <div style={{ marginTop: "16px" }}>
            <FieldLabel>{t("addOwnCategory")}</FieldLabel>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t("categoryNamePlaceholder")}
                style={{ ...inputStyle, flex: "1 1 200px", width: "auto" }}
              />
              <button
                type="button"
                onClick={() => {
                  const name = newCategoryName.trim();
                  if (!name) return;
                  setState((s) =>
                    s.customCategories.includes(name) || s.suggestedCategories.some((c) => c.name === name)
                      ? s
                      : {
                          ...s,
                          customCategories: [...s.customCategories, name],
                          selectedCategories: [...s.selectedCategories, name],
                        },
                  );
                  setNewCategoryName("");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "var(--db-radius)",
                  border: "1.5px dashed var(--db-accent)",
                  background: "var(--db-accent-bg)",
                  color: "var(--db-accent)",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "opacity 0.15s ease",
                }}
              >
                <IconPlus size={15} />
                {t("addButton")}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginTop: "24px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
              {t("selectedCategoriesCount", { count: state.selectedCategories.length })}
            </span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <GhostButton onClick={() => setState((s) => ({ ...s, step: 1 }))}>
                <IconArrowLeft size={16} />
                {t("backButton")}
              </GhostButton>
              <PrimaryButton
                onClick={() => setState((s) => ({ ...s, step: 3 }))}
                disabled={state.selectedCategories.length === 0}
              >
                {t("nextButton")}
                <IconArrowRight size={16} />
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3 — Items ────────────────────────────────────────────────── */}
      {state.step === 3 && (
        <Card>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
            {t("itemsTitle")}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
            {t("itemsSubtitle")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {orderedSelectedCategories.map((categoryName) => {
              const list = state.itemsByCategory[categoryName] ?? [];
              const selectedCount = list.filter((i) => i.selected).length;
              const expanded = expandedCategory === categoryName;
              const isLoading = loadingCategory === categoryName;
              const draft = newItemDraft[categoryName] ?? { name: "", price: "" };
              return (
                <div
                  key={categoryName}
                  style={{
                    border: "1px solid var(--db-border)",
                    borderRadius: "12px",
                    background: "var(--db-bg-elevated)",
                    overflow: "hidden",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategoryPanel(categoryName)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      width: "100%",
                      padding: "14px 16px",
                      border: "none",
                      background: "transparent",
                      color: "var(--db-text-primary)",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{categoryName}</span>
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: "999px",
                        background: "var(--db-accent-bg)",
                        color: "var(--db-accent)",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {t("itemsSelectedBadge", { count: selectedCount })}
                    </span>
                  </button>

                  {expanded && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {isLoading && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "12px 0",
                            fontSize: "13px",
                            color: "var(--db-text-secondary)",
                          }}
                        >
                          <Spinner />
                          {t("loadingItems")}
                        </div>
                      )}

                      {!isLoading && list.length === 0 && (
                        <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", margin: "6px 0 12px" }}>
                          {t("noItems")}
                        </p>
                      )}

                      {list.map((item, index) => {
                        const station = item.editedStation ?? item.station;
                        const priceValue = item.editedPrice ?? item.price_cents / 100;
                        // Ephemeral-input keys for this item's refinement panel.
                        const itemKey = `${categoryName}|||${index}`;
                        const groupForm = addingGroupMap[itemKey];
                        return (
                          <div
                            key={`${categoryName}-${index}-${item.name}`}
                            style={{ borderTop: "1px solid var(--db-border)" }}
                          >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "12px",
                              padding: "12px 0",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => updateItem(categoryName, index, { selected: !item.selected })}
                              style={{ marginTop: "4px", accentColor: "var(--db-accent)", cursor: "pointer" }}
                            />
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                                {item.name}
                              </div>
                              {item.description_es && (
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--db-text-tertiary)",
                                    marginTop: "3px",
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {item.description_es}
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  flexWrap: "wrap",
                                  marginTop: "10px",
                                }}
                              >
                                {/* Price */}
                                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>
                                    {t("priceLabel")}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={priceValue}
                                    onChange={(e) => {
                                      const parsed = Number.parseFloat(e.target.value);
                                      updateItem(categoryName, index, {
                                        editedPrice: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
                                      });
                                    }}
                                    style={{ ...inputStyle, width: "104px", padding: "6px 10px", fontSize: "13px" }}
                                  />
                                  <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>
                                    {state.currency}
                                  </span>
                                </label>

                                {/* Station */}
                                <span style={{ display: "inline-flex", gap: "6px" }}>
                                  {(["kitchen", "bar"] as const).map((st) => {
                                    const sel = station === st;
                                    const StIcon = st === "kitchen" ? IconChefHat : IconGlass;
                                    return (
                                      <button
                                        key={st}
                                        type="button"
                                        onClick={() => updateItem(categoryName, index, { editedStation: st })}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          padding: "6px 12px",
                                          borderRadius: "var(--db-radius)",
                                          border: sel ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                                          background: sel ? "var(--db-accent-bg)" : "var(--db-bg-card)",
                                          color: sel ? "var(--db-accent)" : "var(--db-text-secondary)",
                                          fontSize: "12px",
                                          fontWeight: sel ? 700 : 500,
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <StIcon size={13} />
                                        {st === "kitchen" ? t("stationKitchen") : t("stationBar")}
                                      </button>
                                    );
                                  })}
                                </span>

                                {/* Tags (read-only) */}
                                {item.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      padding: "3px 9px",
                                      borderRadius: "999px",
                                      border: "1px solid var(--db-border)",
                                      color: "var(--db-text-tertiary)",
                                      fontSize: "11px",
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}

                                {/* Refine (FASE 4) — optional, per item */}
                                <button
                                  type="button"
                                  onClick={() => void handleOpenRefine(categoryName, index, item)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    padding: "6px 12px",
                                    borderRadius: "var(--db-radius)",
                                    border: item.refineExpanded
                                      ? "2px solid var(--db-accent)"
                                      : item.editedOptions
                                      ? "1px solid var(--db-success)"
                                      : "1px solid var(--db-border)",
                                    background: item.refineExpanded
                                      ? "var(--db-accent-bg)"
                                      : item.editedOptions
                                      ? "color-mix(in srgb, var(--db-success) 10%, transparent)"
                                      : "var(--db-bg-card)",
                                    color: item.refineExpanded
                                      ? "var(--db-accent)"
                                      : item.editedOptions
                                      ? "var(--db-success)"
                                      : "var(--db-text-secondary)",
                                    fontSize: "12px",
                                    fontWeight: item.refineExpanded || item.editedOptions ? 700 : 500,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <IconAdjustments size={13} />
                                  {item.editedOptions ? t("refineSaved") : t("refineButton")}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* ── Refinement panel (FASE 4) ─────────────────── */}
                          {item.refineExpanded && (
                            <div
                              style={{
                                background: "var(--db-bg-card)",
                                borderTop: "1px solid var(--db-border)",
                                padding: "16px",
                                borderRadius: "0 0 12px 12px",
                                marginBottom: "12px",
                              }}
                            >
                              {item.refineLoading && (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    fontSize: "13px",
                                    color: "var(--db-text-secondary)",
                                  }}
                                >
                                  <Spinner />
                                  {t("refineGenerating")}
                                </div>
                              )}

                              {!item.refineLoading && item.refineError && (
                                <>
                                  <ErrorBanner message={item.refineError} />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleOpenRefine(categoryName, index, {
                                        ...item,
                                        refineExpanded: false,
                                      })
                                    }
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "8px 16px",
                                      borderRadius: "var(--db-radius)",
                                      border: "1px solid var(--db-border)",
                                      background: "var(--db-bg-elevated)",
                                      color: "var(--db-text-secondary)",
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <IconSparkles size={14} />
                                    {t("refineRetry")}
                                  </button>
                                </>
                              )}

                              {!item.refineLoading && !item.refineError && (
                                <>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                    {(item.refinedGroups ?? []).map((group, groupIdx) => {
                                      const optKey = `${itemKey}|||${groupIdx}`;
                                      const optDraft = newOptInputs[optKey];
                                      return (
                                        <div key={`${group.label}-${groupIdx}`}>
                                          {/* Group header */}
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "8px",
                                              flexWrap: "wrap",
                                              marginBottom: "8px",
                                            }}
                                          >
                                            <span
                                              style={{
                                                fontSize: "13px",
                                                fontWeight: 700,
                                                color: "var(--db-text-primary)",
                                              }}
                                            >
                                              {group.label}
                                            </span>
                                            <span
                                              style={{
                                                padding: "2px 7px",
                                                borderRadius: "4px",
                                                background: "var(--db-bg-elevated)",
                                                border: "1px solid var(--db-border)",
                                                color: "var(--db-text-tertiary)",
                                                fontSize: "10px",
                                                fontWeight: 600,
                                                letterSpacing: "0.03em",
                                                textTransform: "uppercase",
                                              }}
                                            >
                                              {group.type === "single"
                                                ? t("refineGroupSingle")
                                                : t("refineGroupMulti")}
                                            </span>
                                            <button
                                              type="button"
                                              title={t("refineDeleteGroup")}
                                              aria-label={t("refineDeleteGroup")}
                                              onClick={() => removeGroup(categoryName, index, groupIdx)}
                                              style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                padding: "3px",
                                                border: "none",
                                                background: "transparent",
                                                color: "var(--db-text-tertiary)",
                                                cursor: "pointer",
                                                transition: "color 0.15s ease",
                                              }}
                                            >
                                              <IconTrash size={14} />
                                            </button>
                                          </div>

                                          {/* Option chips */}
                                          <div
                                            style={{
                                              display: "flex",
                                              flexWrap: "wrap",
                                              gap: "8px",
                                              alignItems: "center",
                                            }}
                                          >
                                            {group.options.map((opt, optIdx) => (
                                              <span
                                                key={`${opt.label}-${optIdx}`}
                                                style={{
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "6px",
                                                  padding: "6px 10px 6px 14px",
                                                  borderRadius: "999px",
                                                  border: "1px solid var(--db-border)",
                                                  background: "var(--db-bg-elevated)",
                                                  color: "var(--db-text-secondary)",
                                                  fontSize: "12px",
                                                  transition: "all 0.15s ease",
                                                }}
                                              >
                                                {opt.label}
                                                {opt.price_delta_cents > 0 && (
                                                  <span
                                                    style={{
                                                      color: "var(--db-text-tertiary)",
                                                      fontWeight: 600,
                                                    }}
                                                  >
                                                    {`+${state.currency} ${(opt.price_delta_cents / 100).toFixed(2)}`}
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeOptionFromGroup(categoryName, index, groupIdx, optIdx)
                                                  }
                                                  style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    padding: 0,
                                                    border: "none",
                                                    background: "transparent",
                                                    color: "var(--db-text-tertiary)",
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  <IconX size={13} />
                                                </button>
                                              </span>
                                            ))}

                                            {/* New option: dashed chip → mini form */}
                                            {optDraft ? (
                                              <span
                                                style={{
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "6px",
                                                  flexWrap: "wrap",
                                                }}
                                              >
                                                <input
                                                  type="text"
                                                  autoFocus
                                                  value={optDraft.label}
                                                  onChange={(e) =>
                                                    setNewOptInputs((m) => ({
                                                      ...m,
                                                      [optKey]: { ...optDraft, label: e.target.value },
                                                    }))
                                                  }
                                                  placeholder={t("refineOptionLabelPlaceholder")}
                                                  style={{
                                                    ...inputStyle,
                                                    width: "160px",
                                                    padding: "6px 10px",
                                                    fontSize: "12px",
                                                  }}
                                                />
                                                <input
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  value={optDraft.delta}
                                                  onChange={(e) =>
                                                    setNewOptInputs((m) => ({
                                                      ...m,
                                                      [optKey]: { ...optDraft, delta: e.target.value },
                                                    }))
                                                  }
                                                  placeholder={t("refinePriceDeltaPlaceholder")}
                                                  style={{
                                                    ...inputStyle,
                                                    width: "120px",
                                                    padding: "6px 10px",
                                                    fontSize: "12px",
                                                  }}
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const label = optDraft.label.trim();
                                                    if (!label) return;
                                                    const units = Number.parseFloat(optDraft.delta);
                                                    addOptionToGroup(categoryName, index, groupIdx, {
                                                      label,
                                                      price_delta_cents: Number.isFinite(units)
                                                        ? Math.max(0, Math.round(units * 100))
                                                        : 0,
                                                    });
                                                    setNewOptInputs((m) => {
                                                      const next = { ...m };
                                                      delete next[optKey];
                                                      return next;
                                                    });
                                                  }}
                                                  style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    padding: "7px 10px",
                                                    borderRadius: "var(--db-radius)",
                                                    border: "none",
                                                    background: "var(--db-accent)",
                                                    color: "var(--db-accent-text)",
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  <IconCheck size={14} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setNewOptInputs((m) => {
                                                      const next = { ...m };
                                                      delete next[optKey];
                                                      return next;
                                                    })
                                                  }
                                                  style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    padding: "7px",
                                                    border: "none",
                                                    background: "transparent",
                                                    color: "var(--db-text-tertiary)",
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  <IconX size={14} />
                                                </button>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setNewOptInputs((m) => ({
                                                    ...m,
                                                    [optKey]: { label: "", delta: "" },
                                                  }))
                                                }
                                                style={{
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "4px",
                                                  padding: "6px 14px",
                                                  borderRadius: "999px",
                                                  border: "1.5px dashed var(--db-accent)",
                                                  background: "var(--db-accent-bg)",
                                                  color: "var(--db-accent)",
                                                  fontSize: "12px",
                                                  fontWeight: 600,
                                                  cursor: "pointer",
                                                  transition: "all 0.15s ease",
                                                }}
                                              >
                                                {t("refineAddOption")}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Add group */}
                                  <div style={{ marginTop: "16px" }}>
                                    {groupForm?.show ? (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <input
                                          type="text"
                                          autoFocus
                                          value={groupForm.label}
                                          onChange={(e) =>
                                            setAddingGroupMap((m) => ({
                                              ...m,
                                              [itemKey]: { ...groupForm, label: e.target.value },
                                            }))
                                          }
                                          placeholder={t("refineNewGroupLabelPlaceholder")}
                                          style={{
                                            ...inputStyle,
                                            width: "190px",
                                            padding: "7px 10px",
                                            fontSize: "12px",
                                          }}
                                        />
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            borderRadius: "var(--db-radius)",
                                            border: "1px solid var(--db-border)",
                                            overflow: "hidden",
                                          }}
                                        >
                                          {(["single", "multi"] as const).map((gt, gi) => {
                                            const sel = groupForm.type === gt;
                                            return (
                                              <button
                                                key={gt}
                                                type="button"
                                                onClick={() =>
                                                  setAddingGroupMap((m) => ({
                                                    ...m,
                                                    [itemKey]: { ...groupForm, type: gt },
                                                  }))
                                                }
                                                style={{
                                                  padding: "7px 14px",
                                                  border: "none",
                                                  borderLeft: gi > 0 ? "1px solid var(--db-border)" : "none",
                                                  background: sel ? "var(--db-accent)" : "var(--db-bg-elevated)",
                                                  color: sel
                                                    ? "var(--db-accent-text)"
                                                    : "var(--db-text-secondary)",
                                                  fontSize: "12px",
                                                  fontWeight: sel ? 700 : 500,
                                                  cursor: "pointer",
                                                  transition: "all 0.15s ease",
                                                }}
                                              >
                                                {gt === "single" ? t("refineGroupSingle") : t("refineGroupMulti")}
                                              </button>
                                            );
                                          })}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const label = groupForm.label.trim();
                                            if (!label) return;
                                            addGroup(categoryName, index, {
                                              label,
                                              type: groupForm.type,
                                              options: [],
                                            });
                                            setAddingGroupMap((m) => ({
                                              ...m,
                                              [itemKey]: { label: "", type: "single", show: false },
                                            }));
                                          }}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            padding: "8px 14px",
                                            borderRadius: "var(--db-radius)",
                                            border: "none",
                                            background: "var(--db-accent)",
                                            color: "var(--db-accent-text)",
                                            fontSize: "12px",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                          }}
                                        >
                                          <IconPlus size={14} />
                                          {t("addButton")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAddingGroupMap((m) => ({
                                              ...m,
                                              [itemKey]: { label: "", type: "single", show: false },
                                            }))
                                          }
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            padding: "8px",
                                            border: "none",
                                            background: "transparent",
                                            color: "var(--db-text-tertiary)",
                                            cursor: "pointer",
                                          }}
                                        >
                                          <IconX size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setAddingGroupMap((m) => ({
                                            ...m,
                                            [itemKey]: { label: "", type: "single", show: true },
                                          }))
                                        }
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          padding: "8px 16px",
                                          borderRadius: "var(--db-radius)",
                                          border: "1.5px dashed var(--db-accent)",
                                          background: "var(--db-accent-bg)",
                                          color: "var(--db-accent)",
                                          fontSize: "12px",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        {t("refineAddGroup")}
                                      </button>
                                    )}
                                  </div>

                                  {/* Panel footer */}
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: "10px",
                                      marginTop: "18px",
                                      paddingTop: "14px",
                                      borderTop: "1px solid var(--db-border)",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => updateItem(categoryName, index, { refineExpanded: false })}
                                      style={{
                                        padding: "9px 16px",
                                        borderRadius: "var(--db-radius)",
                                        border: "1px solid var(--db-border)",
                                        background: "var(--db-bg-elevated)",
                                        color: "var(--db-text-secondary)",
                                        fontSize: "13px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {t("refineClose")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveRefine(categoryName, index, item)}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        padding: "9px 18px",
                                        borderRadius: "var(--db-radius)",
                                        border: "none",
                                        background: "var(--db-accent)",
                                        color: "var(--db-accent-text)",
                                        fontSize: "13px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <IconCheck size={15} />
                                      {t("refineSave")}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          </div>
                        );
                      })}

                      {/* Add your own item */}
                      {!isLoading && (
                        <div style={{ borderTop: "1px solid var(--db-border)", paddingTop: "12px", marginTop: "4px" }}>
                          <FieldLabel>{t("addOwnItem")}</FieldLabel>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(e) =>
                                setNewItemDraft((d) => ({
                                  ...d,
                                  [categoryName]: { name: e.target.value, price: draft.price },
                                }))
                              }
                              placeholder={t("itemNamePlaceholder")}
                              style={{ ...inputStyle, flex: "1 1 180px", width: "auto" }}
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.price}
                              onChange={(e) =>
                                setNewItemDraft((d) => ({
                                  ...d,
                                  [categoryName]: { name: draft.name, price: e.target.value },
                                }))
                              }
                              placeholder={t("itemPricePlaceholder")}
                              style={{ ...inputStyle, width: "120px" }}
                            />
                            <button
                              type="button"
                              onClick={() => addCustomItem(categoryName)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "10px 16px",
                                borderRadius: "var(--db-radius)",
                                border: "1.5px dashed var(--db-accent)",
                                background: "var(--db-accent-bg)",
                                color: "var(--db-accent)",
                                fontSize: "13px",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "opacity 0.15s ease",
                              }}
                            >
                              <IconPlus size={15} />
                              {t("addButton")}
                            </button>
                          </div>
                          {/* TODO(FASE futura): botón "✨ Generar descripción" que llame a
                              polish_item para autocompletar description_es/en + tags del
                              artículo propio. Se deja fuera de FASE 3 para no ampliar
                              el alcance del wizard. */}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginTop: "24px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-secondary)" }}>
              {t("totalSelectedItems", { count: totalSelectedItems })}
            </span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <GhostButton onClick={() => setState((s) => ({ ...s, step: 2 }))}>
                <IconArrowLeft size={16} />
                {t("backButton")}
              </GhostButton>
              <PrimaryButton onClick={() => setState((s) => ({ ...s, step: 4 }))} disabled={totalSelectedItems === 0}>
                {t("nextButton")}
                <IconArrowRight size={16} />
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 4 — Preview + create ─────────────────────────────────────── */}

      {/* FASE 6 — Photo step (shown after menu is created, before final success) */}
      {state.step === 4 && createSuccess && photoPhase === "photos" && createSuccess.createdItems.length > 0 && (() => {
        const items = createSuccess.createdItems;
        const currentItem = items[photoIdx];
        if (!currentItem) return null;
        const gallery = itemGalleries[currentItem.id] ?? [];
        const portada = itemPortadas[currentItem.id] ?? gallery[0] ?? null;
        const candidates = aiCandidates[currentItem.id] ?? [];
        const isGenerating = aiGenerating[currentItem.id] ?? false;
        const aiError = aiErrors[currentItem.id] ?? null;
        const progress = Math.round(((photoIdx) / items.length) * 100);

        return (
          <Card key={`photo-${currentItem.id}`}>
            {/* Header + progress */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "8px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                {t("photosTitle")}
              </h2>
              <span style={{ fontSize: "13px", color: "var(--db-text-tertiary)", fontWeight: 600 }}>
                {t("photosProgress", { current: photoIdx + 1, total: items.length })}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ height: "4px", borderRadius: "2px", background: "var(--db-border)", marginBottom: "20px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "2px",
                  background: "var(--db-accent)",
                  width: `${progress}%`,
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            {/* Item identity */}
            <div style={{ marginBottom: "18px" }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
                {currentItem.name}
              </p>
              {currentItem.description_es && (
                <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  {currentItem.description_es}
                </p>
              )}
            </div>

            {/* Upload source buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "18px" }}>
              {/* File upload */}
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  padding: "14px 8px",
                  borderRadius: "var(--db-radius)",
                  border: "1.5px dashed var(--db-border)",
                  cursor: "pointer",
                  color: "var(--db-text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "border-color 0.2s, color 0.2s",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--db-accent)";
                  e.currentTarget.style.color = "var(--db-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--db-border)";
                  e.currentTarget.style.color = "var(--db-text-secondary)";
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void handlePhotoUpload(currentItem.id, e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <IconUpload size={20} />
                {t("photosUpload")}
              </label>

              {/* AI generate */}
              <button
                onClick={() => void handlePhotoGenerate(currentItem.id, currentItem.name, currentItem.description_es)}
                disabled={isGenerating}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  padding: "14px 8px",
                  borderRadius: "var(--db-radius)",
                  border: `1.5px dashed ${isGenerating ? "var(--db-accent)" : "var(--db-border)"}`,
                  cursor: isGenerating ? "wait" : "pointer",
                  color: isGenerating ? "var(--db-accent)" : "var(--db-text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "transparent",
                  textAlign: "center",
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!isGenerating) {
                    e.currentTarget.style.borderColor = "var(--db-accent)";
                    e.currentTarget.style.color = "var(--db-accent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isGenerating) {
                    e.currentTarget.style.borderColor = "var(--db-border)";
                    e.currentTarget.style.color = "var(--db-text-secondary)";
                  }
                }}
              >
                {isGenerating ? <Spinner /> : <IconSparkles size={20} />}
                {isGenerating ? t("photosGenerating") : t("photosGenAI")}
              </button>

              {/* Internet (disabled placeholder) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  padding: "14px 8px",
                  borderRadius: "var(--db-radius)",
                  border: "1.5px dashed var(--db-border)",
                  cursor: "not-allowed",
                  color: "var(--db-text-tertiary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  opacity: 0.55,
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                <IconGlobe size={20} />
                <span>{t("photosInternet")}</span>
                <span style={{ fontSize: "10px", fontWeight: 500, color: "var(--db-text-tertiary)" }}>
                  {t("photosSoon")}
                </span>
              </div>
            </div>

            {/* AI error banner */}
            {aiError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "var(--db-radius)",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  marginBottom: "14px",
                }}
              >
                <IconAlertTriangle size={16} color="var(--db-danger, #ef4444)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: "12px", color: "var(--db-danger, #ef4444)", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {aiError}
                </span>
              </div>
            )}

            {/* AI candidates grid (shown once generated) */}
            {candidates.length > 0 && (
              <div style={{ marginBottom: "18px" }}>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {t("photosSelectHint")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "10px" }}>
                  {candidates.map((url) => {
                    const selected = gallery.includes(url);
                    return (
                      <button
                        key={url}
                        onClick={() => handleAddCandidateToGallery(currentItem.id, url)}
                        style={{
                          position: "relative",
                          aspectRatio: "1",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: selected ? "2.5px solid var(--db-accent)" : "2px solid var(--db-border)",
                          cursor: "pointer",
                          padding: 0,
                          background: "var(--db-bg-elevated)",
                          transition: "border-color 0.15s",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        {selected && (
                          <span style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            background: "var(--db-accent)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            <IconCheck size={11} color="var(--db-accent-text)" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Generate more */}
                <button
                  onClick={() => void handlePhotoGenerate(currentItem.id, currentItem.name, currentItem.description_es)}
                  disabled={isGenerating}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--db-accent)",
                    background: "transparent",
                    border: "none",
                    cursor: isGenerating ? "wait" : "pointer",
                    padding: "4px 0",
                  }}
                >
                  {isGenerating ? <Spinner /> : <IconSparkles size={14} />}
                  {t("photosGenMore")}
                </button>
              </div>
            )}

            {/* Gallery */}
            {gallery.length > 0 && (
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {gallery.map((url) => {
                    const isCover = url === portada;
                    return (
                      <div
                        key={url}
                        style={{
                          position: "relative",
                          width: "90px",
                          height: "90px",
                          borderRadius: "8px",
                          overflow: "visible",
                          flexShrink: 0,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          style={{
                            width: "90px",
                            height: "90px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            display: "block",
                            border: isCover ? "2.5px solid var(--db-accent)" : "2px solid var(--db-border)",
                          }}
                        />
                        {/* Star / portada toggle */}
                        <button
                          onClick={() => handleSetPortada(currentItem.id, url)}
                          title={t("photosSetPortada")}
                          style={{
                            position: "absolute",
                            bottom: "4px",
                            left: "4px",
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            background: isCover ? "var(--db-accent)" : "rgba(0,0,0,0.55)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            transition: "background 0.15s",
                          }}
                        >
                          {isCover
                            ? <IconStarFilled size={12} color="var(--db-accent-text)" />
                            : <IconStar size={12} color="#fff" />}
                        </button>
                        {/* Remove */}
                        <button
                          onClick={() => handleRemovePhoto(currentItem.id, url)}
                          title={t("photosRemove")}
                          style={{
                            position: "absolute",
                            top: "-6px",
                            right: "-6px",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background: "var(--db-danger, #ef4444)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          <IconX size={11} color="#fff" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Gallery hint */}
                {gallery.length < 3 && (
                  <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "10px 0 0", display: "flex", alignItems: "center", gap: "4px" }}>
                    <IconPhoto size={13} />
                    {t("photosGalleryHint")}
                  </p>
                )}
              </div>
            )}

            {/* Save error */}
            {photoSaveError && (
              <ErrorBanner message={`${t("photosSaveError")} — ${photoSaveError}`} />
            )}

            {/* Footer actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <GhostButton onClick={() => advancePhoto()}>
                  {t("photosSkip")}
                </GhostButton>
                <GhostButton onClick={() => setPhotoPhase("done")}>
                  {t("photosSkipAll")}
                </GhostButton>
              </div>
              <PrimaryButton
                onClick={() => void handleSaveAndAdvance(currentItem.id)}
                disabled={photoSaving || gallery.length === 0}
              >
                {photoSaving ? <Spinner /> : <IconCircleCheck size={16} />}
                {photoSaving ? t("photosSaving") : t("photosSave")}
              </PrimaryButton>
            </div>
          </Card>
        );
      })()}

      {/* Final success screen (shown after photo step completes or is skipped) */}
      {state.step === 4 && createSuccess && (photoPhase === "done" || createSuccess.createdItems.length === 0) && (
        <Card>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "14px",
              padding: "28px 0 12px",
              textAlign: "center",
            }}
          >
            <IconCircleCheck size={56} color="var(--db-success)" />
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--db-text-primary)", margin: 0 }}>
              {t("photosDoneTitle")}
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "var(--db-text-secondary)",
                margin: 0,
                maxWidth: 420,
                lineHeight: 1.6,
              }}
            >
              {t("photosDoneBody", { count: createSuccess.itemCount })}
            </p>

            {/* ── Publish decision ──────────────────────────────────────────── */}
            <div
              style={{
                width: "100%",
                maxWidth: 460,
                marginTop: "10px",
                padding: "20px 24px",
                borderRadius: "var(--db-radius-card)",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "14px",
                textAlign: "center",
              }}
            >
              {publishResult ? (
                /* ── Already published ─────────────────────────────────── */
                <>
                  <IconCircleCheck size={28} color="var(--db-success)" />
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                    {t("publishedResult", { count: publishResult.items })}
                  </p>
                  <Link
                    href="/dashboard/menu"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "11px 22px",
                      borderRadius: "var(--db-radius)",
                      background: "var(--db-accent)",
                      color: "var(--db-accent-text)",
                      fontSize: "14px",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {t("goToEditor")}
                    <IconArrowRight size={16} />
                  </Link>
                </>
              ) : (
                /* ── Decision: publish now or keep as draft ─────────────── */
                <>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
                    {t("publishDecisionTitle")}
                  </p>
                  {publishError && (
                    <ErrorBanner message={`${t("publishError")} — ${publishError}`} />
                  )}
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                    <PrimaryButton
                      onClick={() => void handlePublishMenu()}
                      disabled={publishLoading}
                    >
                      {publishLoading ? <Spinner /> : <IconCircleCheck size={16} />}
                      {publishLoading ? t("publishing") : t("publishNowButton")}
                    </PrimaryButton>
                    <Link
                      href="/dashboard/menu"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "11px 18px",
                        borderRadius: "var(--db-radius)",
                        border: "1px solid var(--db-border)",
                        background: "var(--db-bg-card)",
                        color: "var(--db-text-secondary)",
                        fontSize: "14px",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      {t("draftButton")}
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {state.step === 4 && !createSuccess && (
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
              {t("previewTitle")}
            </h2>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "999px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-tertiary)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {t("previewBadge")}
            </span>
          </div>

          {/* Not-yet-published notice */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 16px",
              borderRadius: "var(--db-radius)",
              border: "1px solid var(--db-warning)",
              background: "color-mix(in srgb, var(--db-warning) 10%, transparent)",
              color: "var(--db-text-secondary)",
              fontSize: "13px",
              lineHeight: 1.5,
              marginBottom: "24px",
            }}
          >
            <IconAlertTriangle size={17} color="var(--db-warning)" style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{t("previewBanner")}</span>
          </div>

          {/* Categories → items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {orderedSelectedCategories.map((categoryName) => {
              const emoji = state.suggestedCategories.find((c) => c.name === categoryName)?.emoji;
              const items = (state.itemsByCategory[categoryName] ?? []).filter((it) => it.selected);
              return (
                <section key={categoryName}>
                  <h3
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--db-text-secondary)",
                      margin: "0 0 12px",
                      paddingBottom: "8px",
                      borderBottom: "1px solid var(--db-border)",
                    }}
                  >
                    {emoji && <span style={{ fontSize: "16px" }}>{emoji}</span>}
                    {categoryName}
                  </h3>

                  {items.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "var(--db-text-tertiary)", margin: 0 }}>
                      {t("previewSectionEmpty")}
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {items.map((item, index) => {
                        const price = item.editedPrice ?? item.price_cents / 100;
                        const optionLines = formatOptionGroups(item.editedOptions);
                        return (
                          <article
                            key={`${categoryName}-preview-${index}-${item.name}`}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "16px",
                              padding: "14px 16px",
                              borderRadius: "12px",
                              border: "1px solid var(--db-border)",
                              background: "var(--db-bg-elevated)",
                              transition: "border-color 0.15s ease",
                            }}
                          >
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  color: "var(--db-text-primary)",
                                }}
                              >
                                {item.name}
                              </div>

                              {item.description_es && (
                                <p
                                  style={{
                                    fontSize: "12.5px",
                                    color: "var(--db-text-tertiary)",
                                    lineHeight: 1.5,
                                    margin: "4px 0 0",
                                    overflow: "hidden",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {item.description_es}
                                </p>
                              )}

                              {item.tags.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "6px",
                                    marginTop: "8px",
                                  }}
                                >
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        padding: "2px 9px",
                                        borderRadius: "999px",
                                        border: "1px solid var(--db-border)",
                                        background: "var(--db-bg-card)",
                                        color: "var(--db-text-tertiary)",
                                        fontSize: "11px",
                                      }}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {optionLines.length > 0 && (
                                <div style={{ marginTop: "8px" }}>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      color: "var(--db-text-tertiary)",
                                      letterSpacing: "0.04em",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {t("previewOptionsLabel")}
                                  </span>
                                  {optionLines.map((line) => (
                                    <div
                                      key={line}
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--db-text-tertiary)",
                                        lineHeight: 1.5,
                                        marginTop: "2px",
                                      }}
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                flexShrink: 0,
                                fontSize: "14px",
                                fontWeight: 700,
                                color: "var(--db-text-primary)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {`${price.toFixed(2)} ${state.currency}`}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {createError && (
            <div style={{ marginTop: "24px" }}>
              <ErrorBanner message={`${t("createError")} — ${createError}`} />
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginTop: createError ? "0" : "28px",
              paddingTop: "18px",
              borderTop: "1px solid var(--db-border)",
              flexWrap: "wrap",
            }}
          >
            <GhostButton onClick={() => setState((s) => ({ ...s, step: 3 }))}>
              <IconArrowLeft size={16} />
              {t("backButton")}
            </GhostButton>
            <PrimaryButton
              onClick={() => void handleCreateMenu()}
              disabled={creating || totalSelectedItems === 0}
            >
              {creating ? <Spinner /> : <IconCheck size={17} />}
              {creating ? t("creating") : t("createButton", { count: totalSelectedItems })}
            </PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
