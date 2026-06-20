"use client";

import { useState } from "react";

/** Token preview — verifies every Design System Section 1 color renders and
 *  that dark/light switching via `data-theme` works (Task 0.2 test step). */

type Token = { name: string; cssVar: string };
type Group = { title: string; tokens: Token[] };

const GROUPS: Group[] = [
  {
    title: "Brand",
    tokens: [
      { name: "brand", cssVar: "--color-brand" },
      { name: "brand-dark", cssVar: "--color-brand-dark" },
      { name: "brand-light", cssVar: "--color-brand-light" },
      { name: "brand-purple", cssVar: "--color-brand-purple" },
      { name: "success", cssVar: "--color-success" },
      { name: "warning", cssVar: "--color-warning" },
      { name: "danger", cssVar: "--color-danger" },
      { name: "gold", cssVar: "--color-gold" },
    ],
  },
  {
    title: "Surface & Text (theme-aware)",
    tokens: [
      { name: "bg-base", cssVar: "--bg-base" },
      { name: "bg-surface", cssVar: "--bg-surface" },
      { name: "bg-elevated", cssVar: "--bg-elevated" },
      { name: "bg-overlay", cssVar: "--bg-overlay" },
      { name: "border-subtle", cssVar: "--border-subtle" },
      { name: "text-primary", cssVar: "--text-primary" },
      { name: "text-secondary", cssVar: "--text-secondary" },
      { name: "text-tertiary", cssVar: "--text-tertiary" },
    ],
  },
  {
    title: "Map — light",
    tokens: [
      { name: "map-light-base", cssVar: "--map-light-base" },
      { name: "map-light-roads", cssVar: "--map-light-roads" },
      { name: "map-light-blocks", cssVar: "--map-light-blocks" },
      { name: "map-light-parks", cssVar: "--map-light-parks" },
      { name: "map-light-water", cssVar: "--map-light-water" },
    ],
  },
  {
    title: "Map — dark",
    tokens: [
      { name: "map-dark-base", cssVar: "--map-dark-base" },
      { name: "map-dark-roads", cssVar: "--map-dark-roads" },
      { name: "map-dark-blocks", cssVar: "--map-dark-blocks" },
      { name: "map-dark-parks", cssVar: "--map-dark-parks" },
      { name: "map-dark-water", cssVar: "--map-dark-water" },
    ],
  },
  {
    title: "Heatmap",
    tokens: [
      { name: "heat-hot", cssVar: "--heat-hot" },
      { name: "heat-warm", cssVar: "--heat-warm" },
      { name: "heat-mild", cssVar: "--heat-mild" },
      { name: "heat-cool", cssVar: "--heat-cool" },
    ],
  },
];

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div
      data-theme={theme}
      style={{
        flex: 1,
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        padding: "2rem",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            JChat 3.0 — Design Tokens
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Section 1 · {GROUPS.reduce((n, g) => n + g.tokens.length, 0)} tokens
          </p>
        </div>
        <button
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          style={{
            background: "var(--color-brand)",
            // No inverse/on-brand text token in Section 1; use the always-white
            // lightest surface token for legible text on the brand fill.
            color: "var(--bg-surface-light)",
            border: "none",
            borderRadius: 8,
            padding: "0.5rem 1rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Theme: {theme}
        </button>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "0.875rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-tertiary)",
              marginBottom: "0.75rem",
            }}
          >
            {group.title}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {group.tokens.map((token) => (
              <div
                key={token.cssVar}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: 56,
                    background: `var(${token.cssVar})`,
                  }}
                />
                <div style={{ padding: "0.5rem 0.625rem" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {token.name}
                  </div>
                  <code
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {token.cssVar}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
