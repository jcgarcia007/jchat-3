"use client";

import { useState } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { MenuTemplateProps } from "./types";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";
import { MENU_PALETTES } from "./shared/palettes";

/**
 * LeftDrawer (#02 Left Drawer Navigation). A hamburger opens a slide-in left
 * panel that holds the whole category IA with per-category counts; the menu
 * body itself is a clean dense list (shared DenseRow), not the card grid.
 * Ported from the Menu Systems Board #02 mock ("Forno") with its original warm
 * palette: cream content area, dark-brown drawer, red accent.
 */

// Board #02 "Forno" palette — semantic colors from the single source.
const P = MENU_PALETTES["left-drawer"]!;
const CREAM = P.bg;
const PANEL = "#5E1A0E"; // bespoke chrome: dark-brown drawer (not a semantic field)
const RED = P.accent;
const INK = P.text;
const MUTED = P.textFaint;
const BORDER = P.border;
const ROW_PALETTE = { card: P.surface, border: P.border, name: P.text, muted: P.textFaint, price: P.price, accent: P.accent };

export default function LeftDrawer({
  business,
  categories,
  activeCategory,
  scrollToCategory,
  sectionRefs,
  onItemAdd,
  cartCount,
  onOpenCart,
}: MenuTemplateProps) {
  const [open, setOpen] = useState(false);

  const nonEmpty = categories.filter((c) => c.items.length > 0);

  return (
    <div style={{ background: CREAM, minHeight: "100vh" }}>
      {/* ── Top bar: hamburger + name · cart ─────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
          background: CREAM,
          borderBottom: `1px solid ${BORDER}`,
          boxShadow: "0 2px 8px rgba(60,42,33,0.08)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir categorías"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: INK,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>☰</span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: "-0.3px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {business.name}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenCart}
          aria-label="Ver carrito"
          style={{
            position: "relative",
            width: 38,
            height: 38,
            borderRadius: 999,
            background: "#FFFFFF",
            border: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            color: INK,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          🛒
          {cartCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 99,
                background: RED,
                color: "#fff",
                fontSize: 10,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 200,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.28s ease",
        }}
      />

      {/* ── Drawer panel ─────────────────────────────────────────────────── */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          width: 260,
          zIndex: 201,
          background: PANEL,
          boxShadow: "8px 0 32px rgba(30,15,8,0.45)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(.22,1,.36,1)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: CREAM }}>
            {business.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            Categorías
          </div>
        </div>

        <nav style={{ padding: "10px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {nonEmpty.map((cat) => {
            const active = cat.id === activeCategory;
            const TablerIcon = getCategoryIcon(cat.icon);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  scrollToCategory(cat.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: active ? "1px solid rgba(255,255,255,0.35)" : "1px solid transparent",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: active ? CREAM : "rgba(255,255,255,0.72)",
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  {cat.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cat.icon_url}
                      alt=""
                      style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : TablerIcon ? (
                    <TablerIcon size={17} stroke={1.5} style={{ flexShrink: 0, color: "currentColor" }} />
                  ) : cat.icon ? (
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{cat.icon}</span>
                  ) : null}
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {cat.name}
                  </span>
                </span>
                <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }}>{cat.items.length}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Body: dense list per section (scroll-spy via sectionRefs) ────── */}
      {nonEmpty.length === 0 ? (
        <EmptyMenu bizName={business.name} />
      ) : (
        <div style={{ paddingBottom: 24 }}>
          {nonEmpty.map((cat) => {
            const TablerIcon = getCategoryIcon(cat.icon);
            return (
              <section
                key={cat.id}
                id={`cat-${cat.id}`}
                ref={(el) => {
                  if (el) sectionRefs.current.set(cat.id, el);
                  else sectionRefs.current.delete(cat.id);
                }}
                style={{ scrollMarginTop: 56 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "20px 16px 12px",
                    maxWidth: 680,
                    margin: "0 auto",
                  }}
                >
                  {cat.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cat.icon_url}
                      alt=""
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                        border: `1.5px solid ${RED}`,
                      }}
                    />
                  ) : TablerIcon ? (
                    <TablerIcon size={22} stroke={1.5} color={RED} />
                  ) : cat.icon ? (
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  ) : null}
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>
                    {cat.name}
                  </h2>
                  <span
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      background: "#FFFFFF",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      padding: "1px 7px",
                    }}
                  >
                    {cat.items.length}
                  </span>
                </div>

                <div
                  style={{
                    maxWidth: 680,
                    margin: "0 auto",
                    padding: "0 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {cat.items.map((item) => (
                    <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} palette={ROW_PALETTE} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
