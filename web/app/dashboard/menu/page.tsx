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

import React, { useCallback, useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconEye,
  IconEyeOff,
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
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type Badge = "best_seller" | "new" | "hot" | null;

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
  sort: number;
  is_published: boolean;
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
  options: ItemOptions | null;
  sort: number;
}

interface CategoryForm {
  name: string;
  icon: string;
}

interface ItemForm {
  name: string;
  description: string;
  priceDollars: string;
  photo_url: string;
  dietary_tags: string[];
  id_required: boolean;
  badge: Badge;
  stock_count: string;
  low_stock_threshold: string;
  options: ItemOptions;
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

const EMPTY_CATEGORY_FORM: CategoryForm = { name: "", icon: "" };

const EMPTY_ITEM_FORM: ItemForm = {
  name: "",
  description: "",
  priceDollars: "",
  photo_url: "",
  dietary_tags: [],
  id_required: false,
  badge: null,
  stock_count: "",
  low_stock_threshold: "",
  options: { sizes: [], extras: [] },
};

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_CATEGORIES: MenuCategory[] = [
  {
    id: "demo-cat-1",
    business_id: "demo-biz",
    name: "Cocktails",
    icon: "🍹",
    sort: 0,
    is_published: true,
  },
  {
    id: "demo-cat-2",
    business_id: "demo-biz",
    name: "Small Bites",
    icon: "🍟",
    sort: 1,
    is_published: true,
  },
  {
    id: "demo-cat-3",
    business_id: "demo-biz",
    name: "Non-Alcoholic",
    icon: "🥤",
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
    options: { sizes: [], extras: [] },
    sort: 1,
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
    options: {
      sizes: [],
      extras: [
        { label: "Add chicken", price_cents: 300 },
        { label: "Extra guac", price_cents: 150 },
      ],
    },
    sort: 0,
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

function badgeLabel(badge: Badge): string {
  return BADGE_OPTIONS.find((b) => b.value === badge)?.label ?? "None";
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
        borderRadius: "8px",
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
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
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
  type: "error" | "success";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const isError = type === "error";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "8px",
        background: isError ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
        color: isError ? "var(--db-danger)" : "var(--db-success)",
        fontSize: "13px",
        marginBottom: "16px",
        lineHeight: 1.5,
      }}
    >
      {isError ? <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <IconCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
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
            <SectionLabel>Sizes (required — single choice)</SectionLabel>
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
              Customer must pick exactly one. Price is added to base price.
            </p>
          </div>
          <button
            type="button"
            onClick={addSize}
            style={smallAddBtnStyle}
          >
            <IconPlus size={12} /> Add size
          </button>
        </div>
        {options.sizes.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", fontStyle: "italic" }}>
            No sizes — item has a single fixed price.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {options.sizes.map((size, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  value={size.label}
                  onChange={(e) => updateSize(i, "label", e.target.value)}
                  placeholder="e.g. Regular"
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
                  title="Remove size"
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
            <SectionLabel>Extras (optional — multi-choice)</SectionLabel>
            <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
              Customer can pick any combination. Each is added to the total.
            </p>
          </div>
          <button
            type="button"
            onClick={addExtra}
            style={smallAddBtnStyle}
          >
            <IconPlus size={12} /> Add extra
          </button>
        </div>
        {options.extras.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", fontStyle: "italic" }}>
            No extras configured.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {options.extras.map((extra, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  value={extra.label}
                  onChange={(e) => updateExtra(i, "label", e.target.value)}
                  placeholder="e.g. Extra shot"
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
                  title="Remove extra"
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

const optionInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "7px",
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
  borderRadius: "6px",
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
  borderRadius: "6px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
};

// ── Item Editor Modal ──────────────────────────────────────────────────────────

function ItemEditorModal({
  item,
  categoryId,
  businessId,
  itemId,
  onSave,
  onCancel,
  saving,
}: {
  item: ItemForm;
  categoryId: string;
  businessId: string;
  itemId: string | null;
  onSave: (form: ItemForm, staged: StagedPhotoFile[], toDelete: SavedPhoto[]) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ItemForm>(item);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ── Multi-photo state ────────────────────────────────────────────────────────
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhotoFile[]>([]);
  const [photosToDelete, setPhotosToDelete] = useState<SavedPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

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
      ? form.dietary_tags.filter((t) => t !== tag)
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
          borderRadius: "14px",
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
            {item.name ? `Edit: ${item.name}` : "New Product"}
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
            <SectionLabel>Product name *</SectionLabel>
            <FieldInput
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder='e.g. "Mango Daiquiri"'
            />
          </div>

          {/* Description */}
          <div>
            <SectionLabel>Description</SectionLabel>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Short description of ingredients / prep style…"
              rows={2}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
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

          {/* Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <SectionLabel>Base price (USD) *</SectionLabel>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "14px",
                    color: "var(--db-text-tertiary)",
                    pointerEvents: "none",
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.priceDollars}
                  onChange={(e) => set("priceDollars", e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 26px",
                    borderRadius: "8px",
                    border: "1px solid var(--db-border)",
                    background: "var(--db-bg-elevated)",
                    color: "var(--db-text-primary)",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Stock count */}
            <div>
              <SectionLabel>Stock count</SectionLabel>
              <FieldInput
                type="number"
                value={form.stock_count}
                onChange={(v) => set("stock_count", v)}
                placeholder="Leave blank = unlimited"
              />
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginTop: 4 }}>
                Auto-hidden when stock reaches 0 (handled by getMenu).
              </p>
            </div>
          </div>

          {/* Low stock threshold */}
          {form.stock_count !== "" && (
            <div>
              <SectionLabel>Low stock alert threshold</SectionLabel>
              <FieldInput
                type="number"
                value={form.low_stock_threshold}
                onChange={(v) => set("low_stock_threshold", v)}
                placeholder="e.g. 5 — shows warning badge at this count"
              />
            </div>
          )}

          {/* Fotos del producto */}
          <div>
            <SectionLabel>Fotos del producto</SectionLabel>

            {loadingPhotos ? (
              <p style={{ fontSize: 12, color: "var(--db-text-tertiary)", margin: "0 0 8px" }}>
                Cargando fotos…
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
                            borderRadius: 8,
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
                              borderRadius: 4,
                              pointerEvents: "none",
                            }}
                          >
                            Principal
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
                            borderRadius: 8,
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
                              borderRadius: 4,
                              pointerEvents: "none",
                            }}
                          >
                            Principal
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
                            borderRadius: 4,
                            pointerEvents: "none",
                          }}
                        >
                          Nueva
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
                    borderRadius: 8,
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
                  Agregar fotos (jpeg, png, webp · máx 5 MB)
                </label>

                {/* Legacy photo_url — kept for backwards compatibility */}
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: "var(--db-text-tertiary)", margin: "0 0 4px" }}>
                    O pega una URL directamente (campo heredado):
                  </p>
                  <FieldInput
                    value={form.photo_url}
                    onChange={(v) => set("photo_url", v)}
                    placeholder="https://… (URL de imagen)"
                  />
                  {form.photo_url && savedPhotos.length === 0 && stagedPhotos.length === 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid var(--db-border)",
                        background: "var(--db-bg-elevated)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.photo_url}
                        alt="preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Dietary tags */}
          <div>
            <SectionLabel>Dietary tags</SectionLabel>
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
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Badge */}
          <div>
            <SectionLabel>Badge</SectionLabel>
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
                      borderRadius: "8px",
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
                    {b.label}
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
              label="ID check required (21+)"
            />
          </div>

          {/* Divider */}
          <div
            style={{
              borderTop: "1px solid var(--db-border)",
              paddingTop: "18px",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                Customization Options
              </span>
              <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: 2 }}>
                Saved to <code style={{ fontFamily: "monospace" }}>menu_items.options</code> as{" "}
                <code style={{ fontFamily: "monospace" }}>&#123;sizes, extras&#125;</code>.
              </p>
            </div>
            <OptionsEditor
              options={form.options}
              onChange={(opts) => set("options", opts)}
            />
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
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "transparent",
              color: "var(--db-text-secondary)",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form, stagedPhotos, photosToDelete)}
            disabled={saving || !form.name.trim() || !form.priceDollars.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 20px",
              borderRadius: "8px",
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
            {saving ? "Saving…" : "Save Product"}
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
  const [form, setForm] = useState<CategoryForm>(initial);
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-accent)",
        borderRadius: "10px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", gap: "10px" }}>
        {/* Emoji icon */}
        <div style={{ width: 80 }}>
          <SectionLabel>Icon (emoji)</SectionLabel>
          {/* TODO(Task 0.4): replace this emoji text input with the full
               emoji / SF Symbol selector component once it's built. */}
          <input
            value={form.icon}
            onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
            placeholder="🍹"
            maxLength={4}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-elevated)",
              color: "var(--db-text-primary)",
              fontSize: "22px",
              textAlign: "center",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <SectionLabel>Category name *</SectionLabel>
          <FieldInput
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            placeholder="e.g. Cocktails"
          />
        </div>
      </div>
      <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: 0 }}>
        {/* TODO(Task 0.4): full emoji / SF Symbol picker coming. */}
        TODO(Task 0.4): emoji/SF symbol selector — text input for now.
      </p>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 14px",
            borderRadius: "7px",
            border: "1px solid var(--db-border)",
            background: "transparent",
            color: "var(--db-text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "7px 14px",
            borderRadius: "7px",
            border: "none",
            background: saving || !form.name.trim() ? "var(--db-text-tertiary)" : "var(--db-accent)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
          }}
        >
          <IconCheck size={13} />
          {saving ? "Saving…" : "Save"}
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
  return (
    <div
      style={{
        background: "var(--db-bg-elevated)",
        border: "1px solid var(--db-border)",
        borderRadius: "10px",
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
          borderRadius: 8,
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
              {badgeLabel(item.badge)}
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
              Hidden
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
              {item.stock_count === 0 ? "Out of stock" : `${item.stock_count} left`}
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
                  {tag.replace("_", " ")}
                </span>
              ))}
            </div>
          )}

          {item.options &&
            ((item.options.sizes?.length ?? 0) > 0 || (item.options.extras?.length ?? 0) > 0) && (
              <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
                {(item.options.sizes?.length ?? 0) > 0 && `${item.options.sizes!.length} size${item.options.sizes!.length !== 1 ? "s" : ""}`}
                {(item.options.sizes?.length ?? 0) > 0 && (item.options.extras?.length ?? 0) > 0 && " · "}
                {(item.options.extras?.length ?? 0) > 0 && `${item.options.extras!.length} extra${item.options.extras!.length !== 1 ? "s" : ""}`}
              </span>
            )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title="Edit product"
          style={iconBtnStyle}
        >
          <IconEdit size={14} />
        </button>
        <button
          onClick={onTogglePublish}
          disabled={toggling}
          title={item.is_published ? "Hide from menu" : "Show on menu"}
          style={{ ...iconBtnStyle, opacity: toggling ? 0.5 : 1 }}
        >
          {item.is_published ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete product"
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

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: "7px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-secondary)",
  cursor: "pointer",
};

// ── CategorySection ────────────────────────────────────────────────────────────

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
  onItemSave: (form: ItemForm, staged: StagedPhotoFile[], toDelete: SavedPhoto[]) => void;
  onItemEditCancel: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isFirst = allCategories[0]?.id === category.id;
  const isLast = allCategories[allCategories.length - 1]?.id === category.id;

  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
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
            title="Move category up"
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
            title="Move category down"
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
          {category.icon && (
            <span style={{ fontSize: "20px", lineHeight: 1 }}>{category.icon}</span>
          )}
          <span style={{ fontSize: "15px", fontWeight: 700 }}>{category.name}</span>
          <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginLeft: 2 }}>
            ({items.length} item{items.length !== 1 ? "s" : ""})
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
              Hidden
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
            title="Edit category"
            style={iconBtnStyle}
          >
            <IconEdit size={14} />
          </button>
          <button
            onClick={() => onToggleCategoryPublish(category)}
            disabled={togglingCat}
            title={category.is_published ? "Hide category" : "Show category"}
            style={{ ...iconBtnStyle, opacity: togglingCat ? 0.5 : 1 }}
          >
            {category.is_published ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </button>
          <button
            onClick={() => onDeleteCategory(category)}
            title="Delete category"
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
              No items yet — add the first product below.
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
              borderRadius: "8px",
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
            Add product
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
        />
      )}
    </div>
  );
}

const reorderBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 18,
  borderRadius: "4px",
  border: "1px solid var(--db-border)",
  background: "transparent",
  color: "var(--db-text-tertiary)",
};

// ── Main page component ────────────────────────────────────────────────────────

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [businessId, setBusinessId] = useState<string>("demo-biz");
  const [menuEnabled, setMenuEnabled] = useState(false);
  const [togglingMenu, setTogglingMenu] = useState(false);
  const [menuMode, setMenuMode] = useState<"none" | "external" | "web">("none");
  const [externalMenuUrl, setExternalMenuUrl] = useState<string>("");
  const [urlInput, setUrlInput] = useState<string>("");
  const [savingMode, setSavingMode] = useState(false);
  const [loading, setLoading] = useState(false);
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
      setMenuEnabled(res.business.menu_enabled ?? false);
      const mode = res.business.menu_mode ?? "none";
      setMenuMode(mode);
      const extUrl = res.business.external_menu_url ?? "";
      setExternalMenuUrl(extUrl);
      setUrlInput(extUrl);

      const [catsResult, itemsResult] = await Promise.all([
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
      ]);

      if (catsResult.error) throw catsResult.error;
      if (itemsResult.error) throw itemsResult.error;

      setCategories((catsResult.data as MenuCategory[]) ?? []);
      // Normalize options to guard against DB rows where options is {} or has null arrays
      const rawItems = (itemsResult.data as MenuItem[]) ?? [];
      setItems(rawItems.map((item) => ({
        ...item,
        options: item.options
          ? { sizes: item.options.sizes ?? [], extras: item.options.extras ?? [] }
          : null,
      })));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load menu: ${msg}`);
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
        setError(`Reorder failed: ${msg}`);
        void loadData(); // revert
      }
    },
    [categories, loadData]
  );

  // ── Save category (create / update) ─────────────────────────────────────────
  const handleSaveCategory = useCallback(
    async (form: CategoryForm) => {
      if (!form.name.trim()) {
        setError("Category name is required.");
        return;
      }
      setSavingCat(true);
      setError(null);

      if (!isSupabaseConfigured) {
        if (editingCatId) {
          setCategories((prev) =>
            prev.map((c) =>
              c.id === editingCatId
                ? { ...c, name: form.name.trim(), icon: form.icon || null }
                : c
            )
          );
        } else {
          const newCat: MenuCategory = {
            id: `demo-cat-${Date.now()}`,
            business_id: "demo-biz",
            name: form.name.trim(),
            icon: form.icon || null,
            sort: categories.length,
            is_published: true,
          };
          setCategories((prev) => [...prev, newCat]);
        }
        setShowCatForm(false);
        setEditingCatId(null);
        setCatFormInitial(EMPTY_CATEGORY_FORM);
        setSavingCat(false);
        setSuccess(`Category "${form.name.trim()}" saved.`);
        return;
      }

      try {
        if (editingCatId) {
          const { error: err } = await supabase
            .from("menu_categories")
            .update({ name: form.name.trim(), icon: form.icon || null })
            .eq("id", editingCatId);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from("menu_categories").insert({
            business_id: businessId,
            name: form.name.trim(),
            icon: form.icon || null,
            sort: categories.length,
            is_published: true,
          });
          if (err) throw err;
        }
        setSuccess(`Category "${form.name.trim()}" saved.`);
        setShowCatForm(false);
        setEditingCatId(null);
        setCatFormInitial(EMPTY_CATEGORY_FORM);
        await loadData();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Save category failed: ${msg}`);
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
        setError(`Toggle failed: ${msg}`);
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
      } catch (e: unknown) {
        setMenuEnabled(!next); // revert
        setError("Failed to update menu visibility.");
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
          setError("La URL debe empezar con http:// o https://");
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
          setSuccess("Modo de menú guardado.");
        } catch (e: unknown) {
          setError("Error al guardar el modo de menú.");
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
          setSuccess("Modo de menú actualizado.");
        } catch (e: unknown) {
          setError("Error al guardar el modo de menú.");
        } finally {
          setSavingMode(false);
        }
      }
    },
    [businessId, urlInput],
  );

  // ── Delete category ──────────────────────────────────────────────────────────
  const handleDeleteCategory = useCallback(
    async (cat: MenuCategory) => {
      if (
        !window.confirm(
          `Delete category "${cat.name}"? This will also remove all its products.`
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
        setSuccess(`Category "${cat.name}" deleted.`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Delete failed: ${msg}`);
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
    setActiveItemEdit({
      item: {
        name: item.name,
        description: item.description ?? "",
        priceDollars: formatDollars(item.price_cents),
        photo_url: item.photo_url ?? "",
        dietary_tags: item.dietary_tags ?? [],
        id_required: item.id_required,
        badge: item.badge,
        stock_count: item.stock_count != null ? String(item.stock_count) : "",
        low_stock_threshold:
          item.low_stock_threshold != null ? String(item.low_stock_threshold) : "",
        options: item.options ?? { sizes: [], extras: [] },
      },
      itemId: item.id,
      categoryId: item.category_id,
    });
  }, []);

  // ── Save item (with multi-photo support) ────────────────────────────────────
  const handleSaveItem = useCallback(
    async (form: ItemForm, stagedPhotos: StagedPhotoFile[], photosToDelete: SavedPhoto[]) => {
      if (!activeItemEdit) return;
      if (!form.name.trim() || !form.priceDollars.trim()) {
        setError("Name and price are required.");
        return;
      }
      setSavingItem(true);
      setError(null);

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
        options: form.options,
      };

      if (!isSupabaseConfigured) {
        if (activeItemEdit.itemId) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === activeItemEdit.itemId ? { ...it, ...payload } : it
            )
          );
        } else {
          const newItem: MenuItem = {
            id: `demo-item-${Date.now()}`,
            sort: items.filter((i) => i.category_id === activeItemEdit.categoryId).length,
            ...payload,
          };
          setItems((prev) => [...prev, newItem]);
        }
        setActiveItemEdit(null);
        setSavingItem(false);
        setSuccess(`"${form.name.trim()}" saved.`);
        return;
      }

      try {
        // low_stock_threshold is NOT NULL with default 5 in the DB.
        // payload keeps null (for MenuItem type compat in demo path) but we
        // strip it here so the DB default is used on INSERT and the field is
        // left untouched on UPDATE.
        const dbPayload = {
          ...payload,
          low_stock_threshold: payload.low_stock_threshold ?? undefined,
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

        setSuccess(`"${form.name.trim()}" saved.`);
        setActiveItemEdit(null);
        await loadData();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Save item failed: ${msg}`);
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
        setError(`Toggle failed: ${msg}`);
      } finally {
        setTogglingItemId(null);
      }
    },
    []
  );

  // ── Delete item ──────────────────────────────────────────────────────────────
  const handleDeleteItem = useCallback(
    async (item: MenuItem) => {
      if (!window.confirm(`Delete "${item.name}"?`)) return;
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
        setSuccess(`"${item.name}" deleted.`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Delete failed: ${msg}`);
      } finally {
        setDeletingItemId(null);
      }
    },
    []
  );

  // ── Sorted categories ────────────────────────────────────────────────────────
  const sortedCategories = [...categories].sort((a, b) => a.sort - b.sort);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (noBusiness) {
    return (
      <div style={{ maxWidth: 880 }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "16px" }}>
          Menu Editor
        </h1>
        <NoBusinessCTA message="Register your business to build your menu." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880 }}>
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
            Menu Editor
          </h1>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", marginTop: 4 }}>
            Manage categories and products. Reorder with the arrows; click
            the eye icon to publish or hide items.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          {/* menu_enabled toggle */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <Toggle
              checked={menuEnabled}
              onChange={(v) => void handleToggleMenuEnabled(v)}
              label="Show menu in chat"
            />
            <span
              style={{
                fontSize: "11px",
                color: togglingMenu ? "var(--db-text-tertiary)" : "var(--db-text-tertiary)",
                opacity: togglingMenu ? 0.5 : 1,
              }}
            >
              When on, customers see your menu icon in the venue chat.
            </span>
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
                borderRadius: "8px",
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
              New Category
            </button>
          )}
        </div>
      </div>

      {/* Demo mode banner */}
      {!isSupabaseConfigured && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(245,158,11,0.12)",
            color: "var(--db-warning)",
            fontSize: "13px",
            marginBottom: "20px",
            lineHeight: 1.5,
          }}
        >
          <strong>Demo mode:</strong> Supabase is not configured. Changes apply
          locally only. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable persistence.
        </div>
      )}

      {/* Alerts */}
      {error && (
        <Alert type="error" onClose={() => setError(null)}>
          {error}
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
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--db-text-primary)", margin: "0 0 4px" }}>
          Modo del menú
        </h2>
        <p style={{ fontSize: 13, color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
          Elige cómo quieres mostrar tu menú a los clientes en el hub web.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Opción 1 — Link externo */}
          <label
            style={{
              display: "block",
              padding: "14px 16px",
              borderRadius: 10,
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
                  Tengo mi propio menú (link)
                </div>
                <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginTop: 2 }}>
                  Pega el link a tu menú existente (PDF, Linktree, Google Docs, etc.)
                </div>
              </div>
            </div>

            {/* URL input — visible when external is selected */}
            {menuMode === "external" && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="url"
                    placeholder="https://tu-menu.com"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 8,
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
                      borderRadius: 8,
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
                    {savingMode ? "Guardando…" : "Guardar"}
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
                    Abrir menú ↗
                  </a>
                )}
              </div>
            )}
          </label>

          {/* Opción 2 — Menú Web propio (FUTURO / deshabilitado) */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              border: "2px solid var(--db-border)",
              background: "var(--db-bg-elevated)",
              opacity: 0.55,
              cursor: "not-allowed",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="radio"
                name="menu_mode"
                value="web"
                disabled
                checked={menuMode === "web"}
                onChange={() => {/* futuro */}}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--db-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                  Crear mi Menú Web (plantilla)
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "var(--db-accent)",
                      color: "var(--db-accent-text)",
                    }}
                  >
                    Próximamente
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--db-text-secondary)", marginTop: 2 }}>
                  Crea tu propio menú interactivo con el editor de JChat (categorías, productos, precios).
                </div>
              </div>
            </div>
          </div>

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
              Quitar menú (no mostrar nada)
            </button>
          )}
        </div>

        {/* Estado actual */}
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--db-text-tertiary)" }}>
          Estado actual:{" "}
          <strong>
            {menuMode === "external" && externalMenuUrl
              ? "Link externo configurado ✓"
              : menuMode === "external"
              ? "Link externo (sin URL guardada)"
              : menuMode === "web"
              ? "Menú Web (próximamente)"
              : "Sin menú configurado"}
          </strong>
        </div>
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
          Loading menu…
        </div>
      )}

      {/* Empty state */}
      {!loading && sortedCategories.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--db-text-tertiary)",
            background: "var(--db-bg-surface)",
            borderRadius: "12px",
            border: "1px dashed var(--db-border)",
          }}
        >
          <IconPackage size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: "14px", margin: 0 }}>
            No menu categories yet. Click &ldquo;New Category&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Categories */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {sortedCategories.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              allCategories={sortedCategories}
              items={items.filter((it) => it.category_id === cat.id)}
              onMoveUp={(c) => void reorderCategory(c, "up")}
              onMoveDown={(c) => void reorderCategory(c, "down")}
              onEditCategory={(c) => {
                setEditingCatId(c.id);
                setCatFormInitial({ name: c.name, icon: c.icon ?? "" });
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
            borderRadius: "8px",
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
            fontSize: "12px",
            color: "var(--db-text-tertiary)",
          }}
        >
          {[
            { label: "Categories", value: categories.length },
            {
              label: "Published categories",
              value: categories.filter((c) => c.is_published).length,
            },
            { label: "Total products", value: items.length },
            {
              label: "Published products",
              value: items.filter((it) => it.is_published).length,
            },
            {
              label: "Hidden products",
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
  );
}
