/**
 * JChat 3.0 — Super Admin: Business Radius Config (Chunk A2)
 *
 * Edits platform_config.business_radius_min_m / max_m (singleton).
 * RLS restricts UPDATE to is_platform_admin() — any save attempt by a
 * non-admin will be rejected by the database, not just this UI.
 *
 * The max is the global cap enforced by the enforce_business_radius_cap
 * trigger (migration 021 / updated by A1). The min is a UX guide for the
 * LocationEditor slider — it is NOT validated server-side (a small radius
 * is not a security risk, only a UX inconvenience).
 *
 * Businesses with an approved radius_increase_request can exceed the global
 * max for their own geofence — this panel only sets the default global cap.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconCheck,
  IconInfoCircle,
  IconLoader2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

interface PlatformConfig {
  business_radius_min_m: number;
  business_radius_max_m: number;
}

const DEMO_CONFIG: PlatformConfig = {
  business_radius_min_m: 1,
  business_radius_max_m: 50,
};

export default function BusinessRadiusPage() {
  const t = useTranslations("superAdmin.businessRadius");

  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured) {
        setConfig(DEMO_CONFIG);
        setMinInput(String(DEMO_CONFIG.business_radius_min_m));
        setMaxInput(String(DEMO_CONFIG.business_radius_max_m));
        return;
      }
      const { data, error: e } = await supabase
        .from("platform_config")
        .select("business_radius_min_m, business_radius_max_m")
        .eq("id", true)
        .maybeSingle();
      if (e) throw e;
      if (data) {
        const cfg = data as PlatformConfig;
        setConfig(cfg);
        setMinInput(String(cfg.business_radius_min_m));
        setMaxInput(String(cfg.business_radius_max_m));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = (): boolean => {
    const min = parseInt(minInput, 10);
    const max = parseInt(maxInput, 10);
    if (isNaN(min) || min < 1) {
      setValidationError(t("validMin"));
      return false;
    }
    if (isNaN(max) || max < 1) {
      setValidationError(t("validMax"));
      return false;
    }
    if (min > max) {
      setValidationError(t("validRange"));
      return false;
    }
    setValidationError(null);
    return true;
  };

  const save = useCallback(async () => {
    if (!validate()) return;
    const min = parseInt(minInput, 10);
    const max = parseInt(maxInput, 10);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase
          .from("platform_config")
          .update({ business_radius_min_m: min, business_radius_max_m: max })
          .eq("id", true);
        if (e) throw e;
      }
      setConfig({ business_radius_min_m: min, business_radius_max_m: max });
      setSuccess(t("saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minInput, maxInput, t]);

  return (
    <div style={{ maxWidth: "640px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <IconAdjustmentsHorizontal size={24} stroke={1.6} style={{ color: "var(--color-brand)" }} />
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {t("title")}
        </h1>
      </div>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px", lineHeight: "1.5" }}>
        {t("subtitle")}
      </p>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "14px" }}>
          <IconLoader2 size={16} stroke={1.6} style={{ animation: "spin 1s linear infinite" }} />
          {t("loading")}
        </div>
      ) : (
        <>
          {/* Current values summary */}
          {config && (
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "var(--text-secondary)",
            }}>
              {t("currentLabel", { min: config.business_radius_min_m, max: config.business_radius_max_m })}
            </div>
          )}

          {/* GPS warning */}
          <div style={{
            display: "flex",
            gap: "10px",
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.30)",
            borderRadius: "10px",
            padding: "12px 14px",
            marginBottom: "20px",
          }}>
            <IconAlertCircle size={16} stroke={1.6} style={{ color: "var(--color-warning)", flexShrink: 0, marginTop: "1px" }} />
            <p style={{ fontSize: "13px", color: "var(--text-primary)", margin: 0, lineHeight: "1.5" }}>
              {t("gpsWarning")}
            </p>
          </div>

          {/* Form fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
            {/* Min field */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                {t("fieldMin")}
              </label>
              <input
                type="number"
                min={1}
                value={minInput}
                onChange={(e) => { setMinInput(e.target.value); setValidationError(null); setSuccess(null); }}
                style={{
                  width: "160px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                {t("hintMin")}
              </p>
            </div>

            {/* Max field */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                {t("fieldMax")}
              </label>
              <input
                type="number"
                min={1}
                value={maxInput}
                onChange={(e) => { setMaxInput(e.target.value); setValidationError(null); setSuccess(null); }}
                style={{
                  width: "160px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                }}
              />
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                {t("hintMax")}
              </p>
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <IconAlertCircle size={14} stroke={1.6} style={{ color: "var(--color-danger)" }} />
              <span style={{ fontSize: "13px", color: "var(--color-danger)" }}>{validationError}</span>
            </div>
          )}

          {/* Save error */}
          {error && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <IconAlertCircle size={14} stroke={1.6} style={{ color: "var(--color-danger)" }} />
              <span style={{ fontSize: "13px", color: "var(--color-danger)" }}>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <IconCheck size={14} stroke={1.6} style={{ color: "var(--color-success)" }} />
              <span style={{ fontSize: "13px", color: "var(--color-success)" }}>{success}</span>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 20px",
              borderRadius: "8px",
              background: saving ? "var(--bg-surface)" : "var(--color-brand)",
              color: saving ? "var(--text-secondary)" : "#fff",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              marginBottom: "28px",
            }}
          >
            {saving && <IconLoader2 size={14} stroke={1.6} style={{ animation: "spin 1s linear infinite" }} />}
            {t("save")}
          </button>

          {/* Override note */}
          <div style={{
            display: "flex",
            gap: "10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "10px",
            padding: "12px 14px",
          }}>
            <IconInfoCircle size={16} stroke={1.6} style={{ color: "var(--color-brand)", flexShrink: 0, marginTop: "1px" }} />
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: "1.5" }}>
              {t("overrideNote")}
            </p>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
