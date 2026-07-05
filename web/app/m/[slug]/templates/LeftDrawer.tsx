"use client";

import { useState } from "react";
import { getCategoryIcon } from "@/lib/categoryIcons";
import type { MenuTemplateProps } from "./types";
import { DenseRow } from "./shared/DenseRow";
import { EmptyMenu } from "./shared/EmptyMenu";

/**
 * LeftDrawer (#02 Left Drawer Navigation). A hamburger opens a slide-in left
 * panel that holds the whole category IA with per-category counts; the menu
 * body itself is a clean dense list (shared DenseRow), not the card grid.
 * Ported from the Menu Systems Board #02 mock but themed with the public-menu
 * design tokens, not the mock's warm cream palette.
 */
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
    <>
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
          background: "var(--bg-base)",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
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
            color: "var(--text-primary)",
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
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            color: "var(--text-primary)",
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
                background: "var(--color-brand)",
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
          background: "var(--bg-surface)",
          boxShadow: "8px 0 32px rgba(0,0,0,0.45)",
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
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>
            {business.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
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
                  border: active ? "1px solid var(--color-gold)" : "1px solid transparent",
                  background: active ? "rgba(217,119,6,0.15)" : "transparent",
                  color: active ? "var(--color-gold)" : "var(--text-secondary)",
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
                        border: "1.5px solid rgba(217,119,6,0.5)",
                      }}
                    />
                  ) : TablerIcon ? (
                    <TablerIcon size={22} stroke={1.5} color="var(--color-gold)" />
                  ) : cat.icon ? (
                    <span style={{ fontSize: 20 }}>{cat.icon}</span>
                  ) : null}
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    {cat.name}
                  </h2>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
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
                    <DenseRow key={item.id} item={item} onItemAdd={onItemAdd} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
