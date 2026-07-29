"use client";

/**
 * JChat 3.0 — Business Location & Geofence editor (inside the Settings page).
 *
 * Tools above the map: Pin · Circle · Polygon · Clear.
 *  - Pin (default): click/drag moves the red marker → business latitude/longitude.
 *  - Circle: click drops an editable+draggable google.maps.Circle (initial radius
 *    = slider); the slider resizes it; only one at a time; pin follows its center.
 *  - Polygon: clicks add vertices, double-click closes; editable after; one only.
 *  - Clear: removes the drawn circle/polygon, keeps the pin, returns to Pin mode.
 *
 * Save → businesses.latitude/longitude (pin), geofence_radius_m (slider),
 * geofence_polygon (GeoJSON of the circle/polygon, else null). Mirrors legacy
 * lat/lng/radius_m so the map + nearby stay in sync.
 *
 * Maps: @vis.gl/react-google-maps (uncontrolled defaultCenter so panning is free);
 * overlays are native google.maps managed via useMap() with guarded cleanup.
 * Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY; degrades to manual lat/lng inputs without it.
 *
 * Reverse geocoding: dropping the pin (dragend) or clicking the map in Pin mode
 * resolves the address via google.maps.Geocoder and reports it up through
 * onAddressResolved — the pin is the source of truth, so moving it again
 * overwrites whatever the owner typed. The address itself lives in the
 * Business Info field above (businesses.address), not here: this component
 * only fills it, it never owns or saves it. If the Geocoder fails (API not
 * enabled, no result, network), the pin/coords still save fine — geocoding
 * is best-effort UX, never a save blocker.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Map as GMap, useMap } from "@vis.gl/react-google-maps";
import {
  IconMapPin,
  IconCheck,
  IconAlertCircle,
  IconTrash,
  IconX,
  IconArrowRight,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
// Fallback view when the business has no saved coordinates: center of the USA.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

// Fallback caps used when platform_config cannot be read. The real values are
// fetched from platform_config on mount (Chunk A2). EVENT_RADIUS_CAP is
// prepared for the future events flow and is not stored in platform_config yet.
const BUSINESS_RADIUS_CAP_FALLBACK_MIN = 1;  // absolute floor
const BUSINESS_RADIUS_CAP_FALLBACK_MAX = 50; // matches the DB seed
export const EVENT_RADIUS_CAP = 1609; // 1 mile, for the future events flow

type LatLng = { lat: number; lng: number };
type Tool = "pin";

/** Brand accent for canvas overlays — reads the --db-accent token at runtime. */
function accentColor(): string {
  if (typeof window === "undefined") return "rgb(92,124,250)";
  const root = getComputedStyle(document.documentElement);
  return (
    root.getPropertyValue("--db-accent").trim() ||
    root.getPropertyValue("--color-brand").trim() ||
    "rgb(92,124,250)"
  );
}

// ── Imperative recenter (does NOT control the map, so panning stays free) ───────
function Recenter({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    map.setZoom(15);
  }, [map, target]);
  return null;
}

// ── Unified geofence layer: pin + radius circle + drawn circle/polygon ──────────
function GeofenceLayer({
  tool,
  pin,
  radius,
  onPinMove,
  onPinSettled,
  onShapeChange,
  registerClear,
}: {
  tool: Tool;
  pin: LatLng;
  radius: number;
  onPinMove: (p: LatLng) => void;
  /** Fires only for dragend + Pin-mode map click — NOT on continuous drag. Used to trigger reverse geocoding. */
  onPinSettled: (p: LatLng) => void;
  onShapeChange: (geojson: unknown | null) => void;
  registerClear: (fn: () => void) => void;
}) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const pinCircleRef = useRef<google.maps.Circle | null>(null); // pin-mode visual radius

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const onPinMoveRef = useRef(onPinMove);
  onPinMoveRef.current = onPinMove;
  const onPinSettledRef = useRef(onPinSettled);
  onPinSettledRef.current = onPinSettled;
  const onShapeRef = useRef(onShapeChange);
  onShapeRef.current = onShapeChange;

  const clearShapes = useCallback(() => {
    onShapeRef.current(null);
  }, []);

  // Init marker + map listeners (once the map is ready).
  useEffect(() => {
    if (!map || typeof google === "undefined") return;

    const marker = new google.maps.Marker({ map, position: pin, draggable: true });
    markerRef.current = marker;
    const dragL = marker.addListener("dragend", () => {
      const p = marker.getPosition();
      if (!p) return;
      const pos: LatLng = { lat: p.lat(), lng: p.lng() };
      onPinMoveRef.current(pos);
      onPinSettledRef.current(pos);
    });

    const clickL = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      const pos: LatLng = { lat: ll.lat(), lng: ll.lng() };
      onPinMoveRef.current(pos);
      onPinSettledRef.current(pos);
    });

    registerClear(clearShapes);

    return () => {
      google.maps.event.removeListener(dragL);
      google.maps.event.removeListener(clickL);
      marker.setMap(null);
      markerRef.current = null;
      pinCircleRef.current?.setMap(null);
      pinCircleRef.current = null;
    };
    // Init once when the map is ready; pin syncs via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clearShapes, registerClear]);

  // Keep the marker synced when the pin is set externally (search / load / circle).
  useEffect(() => {
    markerRef.current?.setPosition(pin);
  }, [pin]);

  // Each tool starts fresh: switching clears any drawn circle/polygon (pin stays).
  useEffect(() => {
    clearShapes();
  }, [tool, clearShapes]);

  // Pin-mode visual radius circle (only in pin mode).
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    if (tool === "pin") {
      const accent = accentColor();
      if (!pinCircleRef.current) {
        pinCircleRef.current = new google.maps.Circle({
          map,
          center: pin,
          radius,
          clickable: false,
          strokeColor: accent,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: accent,
          fillOpacity: 0.15,
        });
      } else {
        pinCircleRef.current.setCenter(pin);
        pinCircleRef.current.setRadius(radius);
      }
    } else {
      pinCircleRef.current?.setMap(null);
      pinCircleRef.current = null;
    }
  }, [map, tool, pin, radius]);


  return null;
}

// ── Main editor ─────────────────────────────────────────────────────────────────

export function LocationEditor({
  businessId,
  onAddressResolved,
  externalCoords,
}: {
  businessId: string | null;
  /** Called with the reverse-geocoded address after the pin settles (dragend / Pin-mode click). */
  onAddressResolved?: (address: string) => void;
  /** When a new object is passed, moves the pin without triggering reverse-geocode. */
  externalCoords?: { lat: number; lng: number } | null;
}) {
  const t = useTranslations("dashboardCommon");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [tool, setTool] = useState<Tool>("pin");
  const [shape, setShape] = useState<unknown | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null);
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "loading" | "error">("idle");
  const clearRef = useRef<() => void>(() => {});
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onAddressResolvedRef = useRef(onAddressResolved);
  onAddressResolvedRef.current = onAddressResolved;

  // Global config from platform_config (Chunk A2). Fallback values are used
  // when the fetch fails so the slider always renders usably.
  const [configMin, setConfigMin] = useState<number>(BUSINESS_RADIUS_CAP_FALLBACK_MIN);
  const [configMax, setConfigMax] = useState<number>(BUSINESS_RADIUS_CAP_FALLBACK_MAX);

  // Slider cap: the global max, or the larger value already saved for this business
  // (which means an override was already approved and applied by an admin).
  const [grantedMax, setGrantedMax] = useState<number>(BUSINESS_RADIUS_CAP_FALLBACK_MAX);

  // Radius-increase request modal
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqRadius, setReqRadius] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqDone, setReqDone] = useState(false);

  // Fetch global config from platform_config (Chunk A2). Authenticated users can
  // SELECT via RLS. Degrades to fallback constants on any error so the slider
  // always renders usably.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from("platform_config")
          .select("business_radius_min_m, business_radius_max_m")
          .eq("id", true)
          .maybeSingle();
        if (!active || !data) return;
        const cfg = data as { business_radius_min_m: number; business_radius_max_m: number };
        setConfigMin(cfg.business_radius_min_m);
        setConfigMax(cfg.business_radius_max_m);
        // Also update grantedMax seed in case the business fetch already ran.
        setGrantedMax((prev) => Math.max(cfg.business_radius_max_m, prev));
      } catch {
        // Fallback constants already set — keep them.
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !businessId) return;
    let active = true;
    void (async () => {
      const { data: b } = await supabase
        .from("businesses")
        .select("latitude, longitude, geofence_radius_m, lat, lng, radius_m")
        .eq("id", businessId)
        .maybeSingle();
      if (active && b) {
        const row = b as Record<string, number | null>;
        const blat = row.latitude ?? row.lat ?? null;
        const blng = row.longitude ?? row.lng ?? null;
        const r = row.geofence_radius_m ?? row.radius_m ?? BUSINESS_RADIUS_CAP_FALLBACK_MAX;
        setLat(blat);
        setLng(blng);
        setRadius(r);
        // Effective max = global cap from config, OR the already-saved radius if an
        // admin approved a larger override and applied it to this business.
        setGrantedMax((prev) => Math.max(prev, r));
        if (blat != null && blng != null) setRecenterTo({ lat: blat, lng: blng });
      }
    })();
    return () => {
      active = false;
    };
  }, [businessId]);

  // Apply coords supplied by the Address autocomplete. Programmatic setPosition does
  // NOT fire "dragend", so this never triggers reverse-geocode or re-writes Address.
  useEffect(() => {
    if (!externalCoords) return;
    setLat(externalCoords.lat);
    setLng(externalCoords.lng);
    setRecenterTo(externalCoords);
  }, [externalCoords]);

  const pin: LatLng = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

  const registerClear = useCallback((fn: () => void) => {
    clearRef.current = fn;
  }, []);

  // Reverse geocoding: pin settles (dragend / Pin-mode click) → resolve its address.
  // Best-effort only — never blocks the pin/coords from saving if it fails.
  const handlePinSettled = useCallback((p: LatLng) => {
    if (typeof google === "undefined" || !google.maps.Geocoder) return;
    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();
    setGeocodeStatus("loading");
    geocoderRef.current.geocode({ location: p }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        onAddressResolvedRef.current?.(results[0].formatted_address);
        setGeocodeStatus("idle");
      } else {
        setGeocodeStatus("error");
      }
    });
  }, []);

  const handleClear = useCallback(() => {
    clearRef.current();
    setShape(null);
    setTool("pin");
  }, []);

  const saveBusiness = useCallback(async () => {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (lat == null || lng == null) {
        setError(t("locationSetLocationFirstError"));
        return;
      }
      if (isSupabaseConfigured) {
        const { error: e } = await supabase
          .from("businesses")
          .update({
            latitude: lat,
            longitude: lng,
            geofence_radius_m: radius,
            geofence_polygon: (shape ?? null) as unknown as Json,
            lat,
            lng,
            radius_m: radius,
          })
          .eq("id", businessId);
        if (e) throw e;
      }
      setSuccess(t("locationSavedSuccess"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("locationSaveFailedFallback"));
    } finally {
      setSaving(false);
    }
  }, [businessId, lat, lng, radius, shape, t]);

  const openRequest = useCallback(() => {
    setReqError(null);
    setReqDone(false);
    setReqRadius(String(grantedMax * 2));
    setReqReason("");
    setShowReqModal(true);
  }, [grantedMax]);

  const submitRequest = useCallback(async () => {
    const rr = parseInt(reqRadius, 10);
    if (isNaN(rr) || rr <= grantedMax) {
      setReqError(t("locationRadiusMustExceedError", { m: grantedMax.toLocaleString() }));
      return;
    }
    if (!reqReason.trim()) {
      setReqError(t("locationReasonRequiredError"));
      return;
    }
    setReqSubmitting(true);
    setReqError(null);
    try {
      if (isSupabaseConfigured && businessId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: e } = await supabase.from("radius_increase_requests").insert({
          business_id: businessId,
          requested_by: user?.id ?? null,
          current_radius_m: radius,
          requested_radius_m: rr,
          reason: reqReason.trim(),
        });
        if (e) throw e;
      }
      setReqDone(true);
    } catch (e) {
      setReqError(e instanceof Error ? e.message : t("locationSubmitFailedFallback"));
    } finally {
      setReqSubmitting(false);
    }
  }, [reqRadius, reqReason, grantedMax, businessId, radius, t]);

  const hasKey = MAPS_KEY.length > 0;
  const atCap = radius >= grantedMax;

  const TOOLS: { id: Tool; label: string; icon: typeof IconMapPin }[] = [
    { id: "pin", label: t("locationToolPin"), icon: IconMapPin },
  ];

  const controls = (
    <>
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <FieldLabel>{t("locationRadiusLabel")}</FieldLabel>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-accent)" }}>{radius.toLocaleString()} m</span>
        </div>
        <input
          type="range"
          min={configMin}
          max={grantedMax}
          step={Math.max(1, Math.min(10, configMin))}
          value={Math.min(Math.max(radius, configMin), grantedMax)}
          onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          style={{ width: "100%", accentColor: "var(--db-accent)" }}
        />
        {/* Recommended minimum guide — not a hard limit (GPS accuracy is ~5-20m). */}
        {configMin < 10 && (
          <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "2px 0 0" }}>
            {t("locationRadiusConfigNote")}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
          <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
            {atCap
              ? t("locationMaxRadiusAtCapLabel", { m: grantedMax.toLocaleString() })
              : t("locationMaxRadiusLabel", { m: grantedMax.toLocaleString() })}
          </span>
          {atCap && (
            <button
              type="button"
              onClick={openRequest}
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "5px 10px", borderRadius: "8px", border: "1px solid var(--db-accent)",
                background: "transparent", color: "var(--db-accent)",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
              }}
            >
              {t("locationRequestLargerButton")} <IconArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "10px 0 16px" }}>
        <IconMapPin size={12} style={{ verticalAlign: "middle" }} />{" "}
        {lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : t("locationNoLocationSet")}
        {shape ? ` · ${t("locationGeofenceDrawn", { type: (shape as { type: string }).type })}` : ""}
        {geocodeStatus === "loading" ? ` · ${t("locationGeocodingInProgress")}` : ""}
        {geocodeStatus === "error" ? ` · ${t("locationGeocodingFailedNotice")}` : ""}
      </p>

      <SaveBtn onClick={() => void saveBusiness()} loading={saving} label={t("locationSaveButtonLabel")} />
    </>
  );

  return (
    <div>
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.10)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "12px" }}>
          <IconAlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(29,158,117,0.10)", color: "var(--db-success)", fontSize: "13px", marginBottom: "12px" }}>
          <IconCheck size={15} /> {success}
        </div>
      )}

      {hasKey ? (
        <>
          {/* Drawing toolbar */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            {TOOLS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "7px 12px", borderRadius: "8px",
                  border: tool === id ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                  background: tool === id ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                  color: tool === id ? "var(--db-accent)" : "var(--db-text-secondary)",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)", color: "var(--db-danger)",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}
            >
              <IconTrash size={14} /> {t("locationClearButton")}
            </button>
          </div>

          <div style={{ height: "400px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--db-border)" }}>
            <GMap
              defaultCenter={pin}
              defaultZoom={lat != null && lng != null ? 15 : 4}
              gestureHandling="greedy"
              draggable
              scrollwheel
              disableDoubleClickZoom
              disableDefaultUI={false}
              style={{ width: "100%", height: "400px" }}
            >
              <GeofenceLayer
                tool={tool}
                pin={pin}
                radius={radius}
                onPinMove={(p) => { setLat(p.lat); setLng(p.lng); }}
                onPinSettled={handlePinSettled}
                onShapeChange={setShape}
                registerClear={registerClear}
              />
              <Recenter target={recenterTo} />
            </GMap>
          </div>
          <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "6px 0 0" }}>
            {t("locationInstructionsPin")}
          </p>
          {controls}
        </>
      ) : (
        <>
          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(245,158,11,0.10)", color: "var(--db-warning)", fontSize: "13px", marginBottom: "12px" }}>
            {t.rich("locationNoApiKeyMessage", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <FieldLabel>{t("locationLatitudeLabel")}</FieldLabel>
              <NumberInput value={lat} onChange={setLat} placeholder="25.7617" />
            </div>
            <div>
              <FieldLabel>{t("locationLongitudeLabel")}</FieldLabel>
              <NumberInput value={lng} onChange={setLng} placeholder="-80.1918" />
            </div>
          </div>
          {controls}
        </>
      )}

      {/* Radius increase request modal */}
      {showReqModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("locationRequestModalAria")}
          onClick={(e) => { if (e.target === e.currentTarget && !reqSubmitting) setShowReqModal(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: "16px" }}
        >
          <div style={{ background: "var(--db-bg-surface)", border: "1px solid var(--db-border)", borderRadius: "14px", padding: "22px", width: "420px", maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>{t("locationRequestModalTitle")}</h2>
              <button type="button" onClick={() => !reqSubmitting && setShowReqModal(false)} aria-label={t("tablesQrModalCloseAria")} style={{ border: "none", background: "transparent", color: "var(--db-text-secondary)", cursor: "pointer" }}>
                <IconX size={20} />
              </button>
            </div>

            {reqDone ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderRadius: "8px", background: "rgba(29,158,117,0.10)", color: "var(--db-success)", fontSize: "13px", marginBottom: "16px" }}>
                  <IconCheck size={16} /> {t("locationRequestSubmittedSuccess")}
                </div>
                <SaveBtn onClick={() => setShowReqModal(false)} loading={false} label={t("locationDoneButton")} />
              </div>
            ) : (
              <>
                <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "0 0 14px" }}>
                  {t.rich("locationCurrentLimitMessage", {
                    m: grantedMax.toLocaleString(),
                    strong: (chunks) => <strong style={{ color: "var(--db-text-primary)" }}>{chunks}</strong>,
                  })}
                </p>
                <div style={{ marginBottom: "12px" }}>
                  <FieldLabel>{t("locationRequestedRadiusLabel")}</FieldLabel>
                  <NumberInput value={reqRadius === "" ? null : Number(reqRadius)} onChange={(v) => setReqRadius(v == null ? "" : String(v))} placeholder={String(grantedMax * 2)} />
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <FieldLabel>{t("locationReasonLabel")}</FieldLabel>
                  <textarea
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                    placeholder={t("locationReasonPlaceholder")}
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                {reqError && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.10)", color: "var(--db-danger)", fontSize: "13px", marginBottom: "12px" }}>
                    <IconAlertCircle size={15} /> {reqError}
                  </div>
                )}
                <SaveBtn onClick={() => void submitRequest()} loading={reqSubmitting} label={t("locationSubmitRequestButton")} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small shared bits ───────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--db-text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
      placeholder={placeholder}
      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-text-primary)", fontSize: "14px", outline: "none" }}
    />
  );
}

function SaveBtn({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  const t = useTranslations("dashboardCommon");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: "9px 18px", borderRadius: "8px", border: "none",
        background: loading ? "var(--db-text-tertiary)" : "var(--db-accent)",
        color: "var(--db-accent-text)", fontSize: "14px", fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
      }}
    >
      <IconCheck size={15} />
      {loading ? t("tablesSavingState") : label}
    </button>
  );
}
