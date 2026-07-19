"use client";

/**
 * Terminal — take an order for a tab (B6 "tomar pedidos", parte B).
 *
 * Full-screen, tablet-first. The waiter picks a SEAT, taps dishes, and sends the
 * lot to the kitchen. Sending calls the payments EF action create_waiter_order,
 * which re-prices everything from the DB — so nothing here is authoritative about
 * money. The running total shown at the bottom is an ESTIMATE and is labelled as
 * one; the real total comes back from the server.
 *
 * `options` is built by the SHARED @/lib/orderOptions builder — the same one the
 * customer checkout uses — because a different shape would make the server miss
 * the modifiers and undercharge.
 *
 * Tokens: --db-* (the terminal layout fixes data-db-theme). Touch targets ≥44px.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconX, IconPlus, IconMinus, IconCopy, IconTrash, IconAlertTriangle } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { readFunctionError } from "@/lib/functionError";
import { buildOrderOptions, summarizeOptions, type OrderLineOptions } from "@/lib/orderOptions";
import { CategoryCards, type CategoryCard } from "@/components/dashboard/CategoryCards";

// ── Menu shapes (mirrors what /m/[slug] loads) ───────────────────────────────
interface Choice {
  label: string;
  price_cents: number;
}
interface Group {
  id: string;
  label: string;
  type: "single" | "multi";
  min_select: number;
  max_select: number;
  choices: Choice[];
}
interface Dish {
  id: string;
  category_id: string;
  name: string;
  price_cents: number;
  is_available: boolean;
  stock_count: number | null;
  groups: Group[];
}
interface Category {
  id: string;
  name: string;
  icon: string | null;
  icon_url: string | null;
  dishes: Dish[];
}

/** A line the waiter has added but NOT yet sent. */
interface DraftLine {
  key: string;
  dish: Dish;
  qty: number;
  seat: number | null;
  options: OrderLineOptions;
  /** Client-side estimate only — the server re-prices on send. */
  unitEstimateCents: number;
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const fmt = (c: number) => money.format(c / 100);

/** A dish can be ordered only if it's available and not out of stock. */
function isSellable(d: Dish): boolean {
  return d.is_available && (d.stock_count === null || d.stock_count > 0);
}

// Translate the EF's messages into terminal-friendly copy. Never show a raw error.
function friendlyError(msg: string): string {
  if (msg.includes("Esta mesa no está asignada a ti")) return "Esta mesa no está asignada a ti.";
  if (msg.includes("Esa cuenta ya está cerrada")) return "Esa cuenta ya está cerrada. Abre una nueva.";
  if (msg.includes("Tab not found")) return "Esa cuenta ya no existe.";
  if (msg.includes("Item not available")) return "Uno de los platos se acaba de agotar. Quítalo y vuelve a intentarlo.";
  if (msg.includes("Item not found") || msg.includes("does not belong")) return "Uno de los platos ya no está en el menú.";
  if (msg.includes("Cart is empty")) return "No has añadido ningún plato.";
  if (msg.includes("Invalid seat")) return "El asiento no es válido.";
  if (msg.includes("Unauthorized") || msg.includes("Authorization")) return "Tu sesión expiró. Vuelve a entrar.";
  return "No se pudo enviar el pedido. Inténtalo de nuevo.";
}

export function TakeOrderScreen({
  businessId,
  tabId,
  tabName,
  tableLabel,
  seats,
  onClose,
  onSent,
}: {
  businessId: string;
  tabId: string;
  tabName: string;
  tableLabel: string;
  seats: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [seat, setSeat] = useState<number | null>(1);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [configuring, setConfiguring] = useState<Dish | null>(null);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTotal, setSentTotal] = useState<number | null>(null);
  // Review step: sending always goes through it — never straight from the button.
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Belt-and-braces against a double send: React state is async, so a fast second
  // tap could read a stale `sending`. This ref flips synchronously.
  const inFlight = useRef(false);

  // ── Load the menu (same queries as the public menu page) ──────────────────
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const catsRes = await supabase
        .from("menu_categories")
        .select("id, name, icon, icon_url, sort")
        .eq("business_id", businessId)
        .eq("is_published", true)
        .order("sort");
      if (catsRes.error) throw catsRes.error;
      const cats = (catsRes.data ?? []) as { id: string; name: string; icon: string | null; icon_url: string | null }[];

      const itemsRes = await supabase
        .from("menu_items")
        .select("id, category_id, name, price_cents, is_available, stock_count, sort")
        .eq("business_id", businessId)
        .eq("is_published", true)
        .order("sort");
      if (itemsRes.error) throw itemsRes.error;
      const items = (itemsRes.data ?? []) as Omit<Dish, "groups">[];

      // Modifier groups via the bridge table — identical to the public menu.
      const itemIds = items.map((i) => i.id);
      const groupsByItem = new Map<string, Group[]>();
      if (itemIds.length > 0) {
        const bridgeRes = await supabase
          .from("menu_item_modifier_groups")
          .select("menu_item_id, modifier_group_id, sort")
          .in("menu_item_id", itemIds)
          .order("sort");
        if (bridgeRes.error) throw bridgeRes.error;
        const bridge = (bridgeRes.data ?? []) as { menu_item_id: string; modifier_group_id: string }[];
        const groupIds = [...new Set(bridge.map((b) => b.modifier_group_id))];
        if (groupIds.length > 0) {
          const gRes = await supabase
            .from("modifier_groups")
            .select("id, label, type, min_select, max_select, choices")
            .in("id", groupIds);
          if (gRes.error) throw gRes.error;
          const byId = new Map(
            ((gRes.data ?? []) as Record<string, unknown>[]).map((g) => [
              g.id as string,
              {
                id: g.id as string,
                label: g.label as string,
                type: (g.type === "multi" ? "multi" : "single") as "single" | "multi",
                min_select: (g.min_select as number) ?? 0,
                max_select: (g.max_select as number) ?? 1,
                choices: (Array.isArray(g.choices) ? g.choices : [])
                  .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
                  .map((c) => ({
                    label: typeof c.label === "string" ? c.label : String(c.label ?? ""),
                    price_cents: typeof c.price_cents === "number" ? c.price_cents : 0,
                  })),
              } as Group,
            ]),
          );
          for (const b of bridge) {
            const g = byId.get(b.modifier_group_id);
            if (!g) continue;
            const arr = groupsByItem.get(b.menu_item_id) ?? [];
            arr.push(g);
            groupsByItem.set(b.menu_item_id, arr);
          }
        }
      }

      setCategories(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          icon_url: c.icon_url,
          dishes: items
            .filter((i) => i.category_id === c.id)
            .map((i) => ({ ...i, groups: groupsByItem.get(i.id) ?? [] })),
        })),
      );
      setActiveCat((cur) => cur ?? cats[0]?.id ?? null);
      setLoading(false);
    } catch {
      setLoadError(true);
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // ── Cards for CategoryCards ───────────────────────────────────────────────
  // The terminal is a SELLING surface: it must not show admin bookkeeping. We only
  // load published categories/items, and we hard-set hidden/untranslated to false
  // so those pills can never render here. `outOfStock` IS kept — a waiter needs to
  // know what they can't sell. (No change to the shared component.)
  const cards: CategoryCard[] = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        iconUrl: c.icon_url,
        icon: c.icon,
        publishedCount: c.dishes.length,
        outOfStock: c.dishes.filter((d) => !isSellable(d)).length,
        hidden: false,        // admin-only signal — never in the terminal
        untranslated: false,  // admin-only signal — never in the terminal
      })),
    [categories],
  );

  const totalPublished = useMemo(
    () => categories.reduce((s, c) => s + c.dishes.length, 0),
    [categories],
  );

  const shownDishes = useMemo(() => {
    if (activeCat === null) return categories.flatMap((c) => c.dishes);
    return categories.find((c) => c.id === activeCat)?.dishes ?? [];
  }, [categories, activeCat]);

  // ── Draft manipulation ────────────────────────────────────────────────────
  // These two count the WHOLE draft on purpose — never the active seat. The send
  // button showing "2 platos" while the ticket carries 7 would make the waiter send
  // believing it's smaller than it is.
  const estimateTotal = lines.reduce((s, l) => s + l.unitEstimateCents * l.qty, 0);
  const dishCount = lines.reduce((s, l) => s + l.qty, 0);

  /** Dishes per seat (key: seat number, or "none"), for the selector badges. */
  const countBySeat = useMemo(() => {
    const m = new Map<number | "none", number>();
    for (const l of lines) {
      const k = l.seat ?? "none";
      m.set(k, (m.get(k) ?? 0) + l.qty);
    }
    return m;
  }, [lines]);

  /** The draft filtered to the seat currently selected in the header. */
  const seatLines = useMemo(() => lines.filter((l) => l.seat === seat), [lines, seat]);

  /** Draft grouped by seat, for the review step. Seats in order, "sin asiento" last. */
  const bySeat = useMemo(() => {
    const groups = new Map<number | "none", DraftLine[]>();
    for (const l of lines) {
      const k = l.seat ?? "none";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(l);
    }
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === "none") return 1;
      if (b[0] === "none") return -1;
      return (a[0] as number) - (b[0] as number);
    });
  }, [lines]);

  function addLine(dish: Dish, options: OrderLineOptions, unitCents: number) {
    setSendError(null);
    setSentTotal(null);
    setLines((cur) => [
      ...cur,
      {
        key: `${dish.id}-${cur.length}-${Date.now()}`,
        dish,
        qty: 1,
        seat,
        options,
        unitEstimateCents: unitCents,
      },
    ]);
  }

  function tapDish(dish: Dish) {
    if (!isSellable(dish)) return; // out of stock → not addable (also guarded in UI)
    if (dish.groups.length > 0) {
      setConfiguring(dish);
      return;
    }
    // No modifiers → one tap, straight into the order (the speed the floor needs).
    addLine(dish, buildOrderOptions({}), dish.price_cents);
  }

  function duplicateLine(key: string) {
    setLines((cur) => {
      const l = cur.find((x) => x.key === key);
      if (!l) return cur;
      return [...cur, { ...l, key: `${l.dish.id}-dup-${Date.now()}`, qty: 1 }];
    });
  }
  function setQty(key: string, delta: number) {
    setLines((cur) =>
      cur.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(99, l.qty + delta)) } : l)),
    );
  }
  function setLineSeat(key: string, s: number | null) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, seat: s } : l)));
  }
  function removeLine(key: string) {
    setLines((cur) => cur.filter((l) => l.key !== key));
  }

  // ── Send to kitchen ───────────────────────────────────────────────────────
  async function send() {
    // Synchronous guard first: two taps in the same tick would both pass a
    // state-based check and create TWO orders.
    if (inFlight.current || lines.length === 0) return;
    inFlight.current = true;
    setSending(true);
    setSendError(null);
    setSentTotal(null);

    try {
      const { data, error } = await supabase.functions.invoke("payments", {
        body: {
          action: "create_waiter_order",
          tab_id: tabId,
          items: lines.map((l) => ({
            menu_item_id: l.dish.id,
            qty: l.qty,
            options: l.options,
            special_instructions: null,
            seat: l.seat,
          })),
        },
      });

      if (error) {
        setSendError(friendlyError(await readFunctionError(error)));
        return;
      }

      const res = data as { total_cents?: number } | null;
      // Show the SERVER's total, not our estimate.
      setSentTotal(typeof res?.total_cents === "number" ? res.total_cents : null);
      setLines([]);
      setReviewing(false); // leave the review step only once it actually landed
      onSent(); // parent reloads the table detail so the new order appears
    } catch {
      setSendError("No se pudo enviar el pedido. Revisa la conexión.");
    } finally {
      setSending(false);
      inFlight.current = false;
    }
  }

  const seatOptions: (number | null)[] = [...Array.from({ length: seats }, (_, i) => i + 1), null];

  return (
    <div style={overlay} role="dialog" aria-label={`Tomar pedido — ${tableLabel}`}>
      {/* ── Pinned block: table + tab + seats + categories ─────────────────
          All of it is ONE opaque, non-scrolling block. The category row used to
          live in the scrolling body, so it slid up and got clipped at the top of
          the scroll area (it read as "hidden under the header"). Keeping it here
          means the waiter can always see, and change, both the active seat and
          the active category. Opaque background so nothing shows through. */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>{tableLabel}</div>
            <div style={{ fontSize: 13, color: "var(--db-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tabName}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <IconX size={22} />
          </button>
        </div>

        {/* Seats — horizontal, snapped, with a fade when there's more to the right */}
        <div style={{ marginTop: 10 }}>
          <div style={pinnedLabel}>Asiento — se aplica a lo que añadas</div>
          <ScrollRow>
            {seatOptions.map((s) => {
              const on = seat === s;
              // How many dishes this seat already has in the draft. Shown as a small
              // count badge so the waiter sees at a glance which seats have ordered,
              // without tapping through them one by one.
              const n = countBySeat.get(s ?? "none") ?? 0;
              return (
                <button
                  key={s ?? "none"}
                  type="button"
                  onClick={() => setSeat(s)}
                  aria-pressed={on}
                  aria-label={
                    s === null
                      ? `Sin asiento, ${n} platos`
                      : `Asiento ${s}, ${n} platos`
                  }
                  style={{
                    position: "relative",
                    flex: "0 0 auto",
                    minWidth: s === null ? 112 : 46,
                    height: 46,
                    borderRadius: 12,
                    fontSize: s === null ? 14 : 17,
                    fontWeight: 800,
                    border: on ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                    background: on ? "var(--db-accent)" : "var(--db-bg-surface)",
                    color: on ? "var(--db-accent-text)" : "var(--db-text-primary)",
                    cursor: "pointer",
                    scrollSnapAlign: "start",
                    overflow: "visible",
                  }}
                >
                  {s === null ? "Sin asiento" : s}
                  {n > 0 && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        minWidth: 20,
                        height: 20,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: "var(--db-success)",
                        color: "var(--db-bg-base)",
                        fontSize: 12,
                        fontWeight: 900,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2px solid var(--db-bg-base)",
                      }}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </ScrollRow>
        </div>

        {/* Categories — pinned with the header, compact so the block stays short */}
        {!loading && !loadError && categories.length > 0 && totalPublished > 0 && (
          <div style={{ marginTop: 6 }}>
            <CategoryCards
              cards={cards}
              totalPublished={totalPublished}
              activeId={activeCat}
              onSelect={setActiveCat}
              compact
            />
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={body}>
        {loading ? (
          <Notice>Cargando el menú…</Notice>
        ) : loadError ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ color: "var(--db-danger)", fontSize: 15, margin: "0 0 12px" }}>
              No se pudo cargar el menú. Revisa la conexión e inténtalo de nuevo.
            </p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={secondaryBtn}>
              Reintentar
            </button>
          </div>
        ) : categories.length === 0 || totalPublished === 0 ? (
          <Notice>
            Este negocio todavía no tiene menú publicado. Pide al encargado que publique platos
            antes de tomar pedidos.
          </Notice>
        ) : (
          <>
            {/* The category row is pinned in the header above — not here. */}
            {shownDishes.length === 0 ? (
              <Notice>Esta categoría no tiene platos.</Notice>
            ) : (
              <div style={dishGrid}>
                {shownDishes.map((d) => {
                  const sellable = isSellable(d);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => tapDish(d)}
                      disabled={!sellable}
                      aria-disabled={!sellable}
                      style={{
                        minHeight: 96,
                        padding: "14px 12px",
                        borderRadius: 14,
                        border: "1px solid var(--db-border)",
                        background: "var(--db-bg-surface)",
                        color: "var(--db-text-primary)",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        // Out of stock: dimmed and NOT tappable.
                        opacity: sellable ? 1 : 0.45,
                        cursor: sellable ? "pointer" : "not-allowed",
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{d.name}</span>
                      <span style={{ marginTop: "auto", fontSize: 14, color: "var(--db-text-secondary)" }}>
                        {fmt(d.price_cents)}
                      </span>
                      {!sellable ? (
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--db-warning)" }}>Agotado</span>
                      ) : d.groups.length > 0 ? (
                        <span style={{ fontSize: 11, color: "var(--db-text-tertiary)" }}>Con opciones</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Draft order list ──────────────────────────────────────── */}
            <div style={{ marginTop: 8 }}>
              {/* The list is scoped to the ACTIVE SEAT. The whole-ticket count lives
                  on the send button below, so a filtered view can't hide dishes. */}
              <SectionTitle>
                {seat === null ? "Sin asiento" : `Silla ${seat}`}
                {seatLines.length > 0 && ` · ${seatLines.reduce((s, l) => s + l.qty, 0)} en esta silla`}
              </SectionTitle>
              {seatLines.length === 0 ? (
                <Empty>
                  {lines.length === 0
                    ? "Toca un plato para añadirlo."
                    : seat === null
                      ? "No hay platos sin asiento."
                      : `La silla ${seat} todavía no ha pedido.`}
                </Empty>
              ) : (
                seatLines.map((l) => {
                  const summary = summarizeOptions(l.options);
                  return (
                    <div key={l.key} style={lineCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{l.dish.name}</div>
                          {summary && (
                            <div style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>{summary}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>
                          {fmt(l.unitEstimateCents * l.qty)}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        {/* qty */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button type="button" onClick={() => setQty(l.key, -1)} aria-label="Menos" style={iconBtn}>
                            <IconMinus size={18} />
                          </button>
                          <span style={{ minWidth: 28, textAlign: "center", fontSize: 16, fontWeight: 800 }}>{l.qty}</span>
                          <button type="button" onClick={() => setQty(l.key, +1)} aria-label="Más" style={iconBtn}>
                            <IconPlus size={18} />
                          </button>
                        </div>

                        {/* seat */}
                        <select
                          value={l.seat ?? ""}
                          onChange={(e) => setLineSeat(l.key, e.target.value === "" ? null : Number(e.target.value))}
                          aria-label="Asiento de esta línea"
                          style={selectStyle}
                        >
                          <option value="">Sin asiento</option>
                          {Array.from({ length: seats }, (_, i) => i + 1).map((s) => (
                            <option key={s} value={s}>Asiento {s}</option>
                          ))}
                        </select>

                        <button type="button" onClick={() => duplicateLine(l.key)} style={miniBtn}>
                          <IconCopy size={16} /> Duplicar
                        </button>
                        <button type="button" onClick={() => removeLine(l.key)} style={{ ...miniBtn, color: "var(--db-danger)" }}>
                          <IconTrash size={16} /> Quitar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Fixed footer: send ────────────────────────────────────────────── */}
      <div style={footer}>
        {sendError && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--db-danger)", marginBottom: 10 }}>
            <IconAlertTriangle size={18} /> {sendError}
          </div>
        )}
        {sentTotal !== null && (
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--db-success)", marginBottom: 10 }}>
            Pedido enviado a cocina · total {fmt(sentTotal)} (calculado por el servidor)
          </div>
        )}
        {/* Opens the REVIEW step — never sends straight from here. The count is the
            whole ticket, not the seat being viewed. */}
        <button
          type="button"
          onClick={() => setReviewing(true)}
          disabled={sending || lines.length === 0}
          style={{
            ...primaryBtn,
            width: "100%",
            opacity: sending || lines.length === 0 ? 0.55 : 1,
            cursor: sending || lines.length === 0 ? "default" : "pointer",
          }}
        >
          {sending
            ? "Enviando…"
            : `${dishCount} ${dishCount === 1 ? "plato" : "platos"} · ${fmt(estimateTotal)} · Enviar a cocina`}
        </button>
        <div style={{ fontSize: 11, color: "var(--db-text-tertiary)", textAlign: "center", marginTop: 6 }}>
          Importe estimado — el total lo calcula el servidor al enviar.
        </div>
      </div>

      {/* ── Review step: the only door to sending ─────────────────────────── */}
      {reviewing && (
        <div style={sheetOverlay} role="dialog" aria-label="Resumen del pedido">
          <div style={{ ...sheetPanel, maxHeight: "92vh" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Revisa el pedido</div>
              <span style={{ fontSize: 13, color: "var(--db-text-secondary)" }}>
                {tableLabel} · {tabName}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--db-text-tertiary)", marginBottom: 12 }}>
              {dishCount} {dishCount === 1 ? "plato" : "platos"} en total
            </div>

            {/* Grouped BY SEAT — that's how the food reaches the table. */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
              {bySeat.map(([key, group]) => (
                <div key={String(key)}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--db-accent)", marginBottom: 6 }}>
                    {key === "none" ? "Sin asiento" : `Silla ${key}`}
                    <span style={{ color: "var(--db-text-tertiary)", fontWeight: 600 }}>
                      {" "}· {group.reduce((s, l) => s + l.qty, 0)}{" "}
                      {group.reduce((s, l) => s + l.qty, 0) === 1 ? "plato" : "platos"}
                    </span>
                  </div>
                  {group.map((l) => {
                    const summary = summarizeOptions(l.options);
                    return (
                      <div key={l.key} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 14 }}>
                        <span style={{ color: "var(--db-text-secondary)", minWidth: 26, fontWeight: 700 }}>
                          {l.qty}×
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{l.dish.name}</span>
                            <span style={{ color: "var(--db-text-secondary)" }}>
                              {fmt(l.unitEstimateCents * l.qty)}
                            </span>
                          </div>
                          {summary && (
                            <div style={{ fontSize: 12, color: "var(--db-text-tertiary)" }}>{summary}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid var(--db-border)", marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 900 }}>
                <span>Total estimado</span>
                <span>{fmt(estimateTotal)}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--db-text-tertiary)", marginTop: 4 }}>
                Estimación — el importe real lo calcula el servidor al enviar.
              </div>

              {sendError && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--db-danger)", marginTop: 10 }}>
                  <IconAlertTriangle size={18} /> {sendError}
                </div>
              )}

              {/* Primary → the only irreversible action. */}
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                style={{ ...primaryBtn, width: "100%", marginTop: 12, opacity: sending ? 0.6 : 1 }}
              >
                {sending ? "Enviando…" : "Confirmar y enviar a cocina"}
              </button>

              {/* Secondary → back, draft untouched. */}
              <button
                type="button"
                onClick={() => setReviewing(false)}
                disabled={sending}
                style={{ ...secondaryBtn, width: "100%", marginTop: 8, justifyContent: "center" }}
              >
                Editar
              </button>

              {/* Destructive → discards the DRAFT only. Nothing was sent, so this
                  touches no database row; it just clears the screen. */}
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                disabled={sending}
                style={{
                  ...secondaryBtn,
                  width: "100%",
                  marginTop: 8,
                  justifyContent: "center",
                  color: "var(--db-danger)",
                  borderColor: "var(--db-danger)",
                }}
              >
                <IconTrash size={16} /> Cancelar pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard confirmation — losing 8 dishes to a stray tap in a rush is exactly
          what must not happen. */}
      {confirmDiscard && (
        <div style={{ ...sheetOverlay, alignItems: "center", zIndex: 90 }} role="dialog" aria-label="Confirmar cancelación">
          <div style={{ ...sheetPanel, borderRadius: 18, maxWidth: 420, margin: "0 16px", maxHeight: "auto" }}>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>¿Cancelar el pedido?</div>
            <p style={{ fontSize: 14, color: "var(--db-text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Se descartará lo que llevas sin enviar ({dishCount}{" "}
              {dishCount === 1 ? "plato" : "platos"}). No se ha enviado nada a cocina, así que no
              se borra ningún pedido — solo se vacía esta pantalla.
            </p>
            <button
              type="button"
              onClick={() => {
                // Draft-only: clear local state and leave. No DB call whatsoever.
                setLines([]);
                setConfirmDiscard(false);
                setReviewing(false);
                onClose();
              }}
              style={{
                ...primaryBtn,
                width: "100%",
                background: "var(--db-danger)",
                color: "var(--db-bg-base)",
              }}
            >
              Sí, descartar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscard(false)}
              style={{ ...secondaryBtn, width: "100%", marginTop: 8, justifyContent: "center" }}
            >
              Seguir con el pedido
            </button>
          </div>
        </div>
      )}

      {/* ── Modifier sheet ────────────────────────────────────────────────── */}
      {configuring && (
        <ModifierSheet
          dish={configuring}
          onCancel={() => setConfiguring(null)}
          onConfirm={(options, unitCents) => {
            addLine(configuring, options, unitCents);
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Modifier picker — same groups and min/max rules the customer menu enforces.
 * Single groups pre-select their first choice (and are required when min_select>0);
 * multi groups cap at max_select.
 */
function ModifierSheet({
  dish,
  onCancel,
  onConfirm,
}: {
  dish: Dish;
  onCancel: () => void;
  onConfirm: (options: OrderLineOptions, unitCents: number) => void;
}) {
  const [single, setSingle] = useState<Record<string, Choice | null>>(() => {
    const init: Record<string, Choice | null> = {};
    for (const g of dish.groups) {
      if (g.type === "single" && g.choices.length > 0) init[g.id] = g.choices[0];
    }
    return init;
  });
  const [multi, setMulti] = useState<Record<string, Set<string>>>({});

  function toggle(g: Group, c: Choice) {
    setMulti((prev) => {
      const cur = new Set(prev[g.id] ?? []);
      if (cur.has(c.label)) cur.delete(c.label);
      else if (cur.size < g.max_select) cur.add(c.label);
      return { ...prev, [g.id]: cur };
    });
  }

  const groupSelections = dish.groups
    .map((g) => {
      if (g.type === "single") {
        const c = single[g.id] ?? null;
        return c ? { groupId: g.id, choices: [c] } : null;
      }
      const sel = multi[g.id] ?? new Set<string>();
      const chosen = g.choices.filter((c) => sel.has(c.label));
      return chosen.length > 0 ? { groupId: g.id, choices: chosen } : null;
    })
    .filter((g): g is { groupId: string; choices: Choice[] } => g !== null);

  // Estimate only — the server re-prices from the DB on send.
  const unitCents =
    dish.price_cents +
    groupSelections.reduce(
      (s, gs) => s + gs.choices.reduce((t, c) => t + (c.price_cents ?? 0), 0),
      0,
    );

  // min_select respected: a required group with nothing chosen blocks confirming.
  const unmet = dish.groups.filter((g) => {
    const chosen = groupSelections.find((gs) => gs.groupId === g.id)?.choices.length ?? 0;
    return chosen < (g.min_select ?? 0);
  });

  return (
    <div style={sheetOverlay} role="dialog" aria-label={`Opciones de ${dish.name}`}>
      <div style={sheetPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{dish.name}</div>
          <button type="button" onClick={onCancel} aria-label="Cancelar" style={closeBtn}>
            <IconX size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {dish.groups.map((g) => (
            <div key={g.id}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                {g.label}
                <span style={{ fontWeight: 600, color: "var(--db-text-tertiary)", marginLeft: 6 }}>
                  {g.type === "single"
                    ? g.min_select > 0 ? "· obligatorio" : "· elige uno"
                    : `· hasta ${g.max_select}`}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.choices.map((c) => {
                  const on =
                    g.type === "single"
                      ? single[g.id]?.label === c.label
                      : (multi[g.id] ?? new Set()).has(c.label);
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() =>
                        g.type === "single"
                          ? setSingle((p) => ({ ...p, [g.id]: c }))
                          : toggle(g, c)
                      }
                      aria-pressed={on}
                      style={{
                        minHeight: 44,
                        padding: "10px 14px",
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 700,
                        border: on ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                        background: on ? "var(--db-accent)" : "var(--db-bg-base)",
                        color: on ? "var(--db-accent-text)" : "var(--db-text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      {c.label}
                      {c.price_cents > 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>+{fmt(c.price_cents)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={unmet.length > 0}
          onClick={() => onConfirm(buildOrderOptions({ groupSelections }), unitCents)}
          style={{ ...primaryBtn, width: "100%", marginTop: 14, opacity: unmet.length > 0 ? 0.55 : 1 }}
        >
          {unmet.length > 0 ? `Elige: ${unmet[0].label}` : `Añadir · ${fmt(unitCents)}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Horizontal row that snaps its children into place and fades its right edge ONLY
 * when there is actually more to scroll — a fade over nothing would be a lie about
 * hidden content. Used for the seat selector (the category row snaps via
 * CategoryCards' own compact styling).
 */
function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, [children]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
          paddingRight: 8,
          scrollSnapType: "x mandatory",
          scrollPaddingLeft: 0,
          scrollPaddingRight: 24,
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </div>
      {overflowing && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 4,
            width: 28,
            pointerEvents: "none",
            background: "linear-gradient(to right, transparent, var(--db-bg-base))",
          }}
        />
      )}
    </div>
  );
}

// ── Presentational bits (tokens only) ────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--db-text-tertiary)", margin: "0 0 8px" }}>{children}</div>;
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--db-text-secondary)", background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: 14, fontSize: 15 }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, color: "var(--db-text-secondary)", padding: "8px 0" }}>{children}</div>;
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "var(--db-bg-base)", zIndex: 70,
  display: "flex", flexDirection: "column",
};
const header: React.CSSProperties = {
  padding: "12px 16px 8px",
  borderBottom: "1px solid var(--db-border)",
  flexShrink: 0,
  // OPAQUE: the body scrolls underneath, nothing may show through.
  background: "var(--db-bg-base)",
  zIndex: 1,
};
const pinnedLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.05em", color: "var(--db-text-tertiary)", marginBottom: 5,
};
const body: React.CSSProperties = {
  flex: 1, overflowY: "auto", padding: "14px 16px",
  display: "flex", flexDirection: "column", gap: 14,
  maxWidth: 900, width: "100%", margin: "0 auto",
  // The footer is a sibling (not overlaying), but keep a little breathing room so
  // the last order line never sits flush against it.
  paddingBottom: 20,
};
const footer: React.CSSProperties = {
  padding: "12px 16px calc(18px + env(safe-area-inset-bottom))",
  borderTop: "1px solid var(--db-border)", background: "var(--db-bg-surface)", flexShrink: 0,
};
const dishGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12,
};
const lineCard: React.CSSProperties = {
  border: "1px solid var(--db-border)", borderRadius: 14,
  background: "var(--db-bg-surface)", padding: "12px 14px", marginBottom: 10,
};
const sheetOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 80,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};
const sheetPanel: React.CSSProperties = {
  background: "var(--db-bg-surface)", borderTop: "1px solid var(--db-border)",
  borderRadius: "18px 18px 0 0", padding: "18px 20px calc(18px + env(safe-area-inset-bottom))",
  width: "100%", maxWidth: 620, maxHeight: "85vh", display: "flex", flexDirection: "column",
};
const closeBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, borderRadius: 12, border: "1px solid var(--db-border)",
  background: "var(--db-bg-surface)", color: "var(--db-text-primary)", cursor: "pointer", flexShrink: 0,
};
const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, borderRadius: 10, border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)", cursor: "pointer",
};
const miniBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
  padding: "8px 14px", borderRadius: 10, border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)", color: "var(--db-text-primary)",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  minHeight: 44, padding: "8px 12px", borderRadius: 10,
  border: "1px solid var(--db-border)", background: "var(--db-bg-base)",
  color: "var(--db-text-primary)", fontSize: 14, fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  minHeight: 56, padding: "14px 20px", borderRadius: 14,
  background: "var(--db-accent)", color: "var(--db-accent-text)",
  border: "none", fontSize: 16, fontWeight: 800,
};
const secondaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44,
  padding: "12px 20px", borderRadius: 12, background: "var(--db-bg-surface)",
  color: "var(--db-text-primary)", border: "1px solid var(--db-border)",
  fontSize: 15, fontWeight: 700, cursor: "pointer",
};
