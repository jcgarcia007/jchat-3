"use client";

/**
 * JChat 3.0 — Location & Geofence editor (lives inside the Settings page).
 *
 * Business mode: draggable pin + Places Autocomplete + radius slider/circle →
 *   saves businesses.latitude/longitude/geofence_radius_m (and mirrors the
 *   legacy lat/lng/radius_m so the map + nearby stay in sync).
 * Event mode: pick an event + draw a Pin / Circle / Polygon with TerraDraw →
 *   saves events.location_lat/location_lng/geofence_polygon (JSONB GeoJSON).
 *
 * Maps: @vis.gl/react-google-maps. Drawing: terra-draw (DrawingManager is
 * deprecated). Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY; degrades to manual lat/lng
 * inputs when the key is absent. Colors: --db-* tokens (the map canvas overlay
 * reads --db-accent at runtime since a canvas layer can't consume CSS vars).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map as GMap,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { TerraDraw, TerraDrawPointMode, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawGoogleMapsAdapter } from "terra-draw-google-maps-adapter";
import {
  IconMapPin,
  IconCheck,
  IconAlertCircle,
  IconPointer,
  IconCircle,
  IconPolygon,
  IconTrash,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "jchat-location-editor";
const DEFAULT_CENTER = { lat: 25.7617, lng: -80.1918 }; // generic fallback view

type LatLng = { lat: number; lng: number };

/** Brand accent for canvas overlays. Reads the --db-accent token at runtime. */
function accentColor(): string {
  if (typeof window === "undefined") return "rgb(92,124,250)";
  const root = getComputedStyle(document.documentElement);
  return (
    root.getPropertyValue("--db-accent").trim() ||
    root.getPropertyValue("--color-brand").trim() ||
    "rgb(92,124,250)"
  );
}

// ── Radius circle overlay (Business mode) ──────────────────────────────────────
function RadiusCircle({ center, radius }: { center: LatLng; radius: number }) {
  const map = useMap();
  const ref = useRef<google.maps.Circle | null>(null);
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const accent = accentColor();
    if (!ref.current) {
      ref.current = new google.maps.Circle({
        map,
        center,
        radius,
        strokeColor: accent,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: accent,
        fillOpacity: 0.15,
        clickable: false,
      });
    } else {
      ref.current.setCenter(center);
      ref.current.setRadius(radius);
    }
  }, [map, center, radius]);
  useEffect(() => () => ref.current?.setMap(null), []);
  return null;
}

// ── Places Autocomplete search box ─────────────────────────────────────────────
function PlacesSearch({ onPlace }: { onPlace: (p: LatLng, address?: string) => void }) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!places || !inputRef.current) return;
    const ac = new places.Autocomplete(inputRef.current, { fields: ["geometry", "formatted_address"] });
    const listener = ac.addListener("place_changed", () => {
      const loc = ac.getPlace().geometry?.location;
      if (loc) onPlace({ lat: loc.lat(), lng: loc.lng() }, ac.getPlace().formatted_address ?? undefined);
    });
    return () => listener.remove();
  }, [places, onPlace]);
  return (
    <input
      ref={inputRef}
      placeholder="Search an address…"
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        color: "var(--db-text-primary)",
        fontSize: "14px",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

// ── Event drawing layer (TerraDraw) ─────────────────────────────────────────────
type DrawMode = "point" | "circle" | "polygon";

function EventDrawer({
  onChange,
  registerClear,
  mode,
}: {
  onChange: (centroid: LatLng | null, polygon: unknown | null) => void;
  registerClear: (fn: () => void) => void;
  mode: DrawMode;
}) {
  const map = useMap();
  const drawRef = useRef<TerraDraw | null>(null);

  // Init TerraDraw once the map is ready.
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const accent = accentColor();
    const styles = {
      fillColor: accent as `#${string}`,
      outlineColor: accent as `#${string}`,
      outlineWidth: 2,
      fillOpacity: 0.2,
    };
    const draw = new TerraDraw({
      adapter: new TerraDrawGoogleMapsAdapter({ lib: google.maps, map, coordinatePrecision: 9 }),
      modes: [
        new TerraDrawPointMode({ styles: { pointColor: accent as `#${string}`, pointWidth: 6 } }),
        new TerraDrawCircleMode({ styles }),
        new TerraDrawPolygonMode({ styles }),
        new TerraDrawSelectMode(),
      ],
    });
    draw.start();
    drawRef.current = draw;

    const emit = () => {
      const features = draw.getSnapshot();
      if (!features.length) {
        onChange(null, null);
        return;
      }
      const f = features[features.length - 1] as {
        geometry: { type: string; coordinates: number[] | number[][][] };
      };
      if (f.geometry.type === "Point") {
        const [lng, lat] = f.geometry.coordinates as number[];
        onChange({ lat, lng }, null);
      } else {
        const ring = (f.geometry.coordinates as number[][][])[0] ?? [];
        let sx = 0;
        let sy = 0;
        ring.forEach(([lng, lat]) => {
          sx += lng;
          sy += lat;
        });
        const n = ring.length || 1;
        onChange({ lat: sy / n, lng: sx / n }, f.geometry);
      }
    };
    draw.on("finish", emit);
    draw.on("change", emit);

    registerClear(() => {
      draw.clear();
      onChange(null, null);
    });

    return () => {
      draw.stop();
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Switch active drawing mode.
  useEffect(() => {
    drawRef.current?.setMode(mode);
  }, [mode]);

  return null;
}

// ── Main editor ─────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  name: string;
  location_lat: number | null;
  location_lng: number | null;
}

export function LocationEditor({ businessId }: { businessId: string | null }) {
  const [mode, setMode] = useState<"business" | "event">("business");

  // Business location
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [savingBiz, setSavingBiz] = useState(false);

  // Events
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [drawMode, setDrawMode] = useState<DrawMode>("polygon");
  const [eventCentroid, setEventCentroid] = useState<LatLng | null>(null);
  const [eventPolygon, setEventPolygon] = useState<unknown | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const clearRef = useRef<() => void>(() => {});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load business location + events
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
        setLat(row.latitude ?? row.lat ?? null);
        setLng(row.longitude ?? row.lng ?? null);
        setRadius(row.geofence_radius_m ?? row.radius_m ?? 200);
      }
      const { data: ev } = await supabase
        .from("events")
        .select("id, name, location_lat, location_lng")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (active) setEvents((ev ?? []) as EventRow[]);
    })();
    return () => {
      active = false;
    };
  }, [businessId]);

  const center: LatLng = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

  const saveBusiness = useCallback(async () => {
    if (!businessId) return;
    setSavingBiz(true);
    setError(null);
    setSuccess(null);
    try {
      if (lat == null || lng == null) {
        setError("Set a location on the map (or enter lat/lng) first.");
        return;
      }
      if (isSupabaseConfigured) {
        const { error: e } = await supabase
          .from("businesses")
          .update({
            latitude: lat,
            longitude: lng,
            geofence_radius_m: radius,
            // Mirror to legacy columns used by the map + nearby.
            lat,
            lng,
            radius_m: radius,
          })
          .eq("id", businessId);
        if (e) throw e;
      }
      setSuccess("Location saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save location.");
    } finally {
      setSavingBiz(false);
    }
  }, [businessId, lat, lng, radius]);

  const saveEvent = useCallback(async () => {
    if (!eventId) {
      setError("Select an event first.");
      return;
    }
    setSavingEvent(true);
    setError(null);
    setSuccess(null);
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase
          .from("events")
          .update({
            location_lat: eventCentroid?.lat ?? null,
            location_lng: eventCentroid?.lng ?? null,
            geofence_polygon: eventPolygon ?? null,
          })
          .eq("id", eventId);
        if (e) throw e;
      }
      setSuccess("Event area saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save event area.");
    } finally {
      setSavingEvent(false);
    }
  }, [eventId, eventCentroid, eventPolygon]);

  const hasKey = MAPS_KEY.length > 0;

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "inline-flex", gap: "4px", padding: "4px", borderRadius: "10px", background: "var(--db-bg-elevated)", marginBottom: "16px" }}>
        {(["business", "event"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); setSuccess(null); }}
            style={{
              padding: "7px 16px",
              borderRadius: "8px",
              border: "none",
              background: mode === m ? "var(--db-accent)" : "transparent",
              color: mode === m ? "var(--db-accent-text)" : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m === "business" ? "Business location" : "Event area"}
          </button>
        ))}
      </div>

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

      {!hasKey && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(245,158,11,0.10)", color: "var(--db-warning)", fontSize: "13px", marginBottom: "12px" }}>
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in .env.local to enable the interactive map. You can still set coordinates manually below.
        </div>
      )}

      {/* ── Business mode ─────────────────────────────────────────────────────── */}
      {mode === "business" && (
        <div>
          {hasKey ? (
            <APIProvider apiKey={MAPS_KEY}>
              <div style={{ marginBottom: "12px" }}>
                <PlacesSearch onPlace={(p) => { setLat(p.lat); setLng(p.lng); }} />
              </div>
              <div style={{ height: "360px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--db-border)" }}>
                <GMap
                  mapId={MAP_ID}
                  defaultCenter={center}
                  center={center}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  style={{ width: "100%", height: "100%" }}
                >
                  <AdvancedMarker
                    position={center}
                    draggable
                    onDragEnd={(e) => {
                      const p = e.latLng;
                      if (p) { setLat(p.lat()); setLng(p.lng()); }
                    }}
                  />
                  <RadiusCircle center={center} radius={radius} />
                </GMap>
              </div>
            </APIProvider>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <FieldLabel>Latitude</FieldLabel>
                <NumberInput value={lat} onChange={setLat} placeholder="25.7617" />
              </div>
              <div>
                <FieldLabel>Longitude</FieldLabel>
                <NumberInput value={lng} onChange={setLng} placeholder="-80.1918" />
              </div>
            </div>
          )}

          {/* Radius slider */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <FieldLabel>Geofence radius</FieldLabel>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-accent)" }}>{radius.toLocaleString()} m</span>
            </div>
            <input
              type="range"
              min={50}
              max={5000}
              step={10}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              style={{ width: "100%", accentColor: "var(--db-accent)" }}
            />
          </div>

          {/* Lat/Lng display */}
          <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "10px 0 16px" }}>
            <IconMapPin size={12} style={{ verticalAlign: "middle" }} />{" "}
            {lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "No location set"}
          </p>

          <SaveBtn onClick={() => void saveBusiness()} loading={savingBiz} label="Save Location" />
        </div>
      )}

      {/* ── Event mode ────────────────────────────────────────────────────────── */}
      {mode === "event" && (
        <div>
          <div style={{ marginBottom: "12px" }}>
            <FieldLabel>Event</FieldLabel>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-primary)",
                fontSize: "14px",
                outline: "none",
              }}
            >
              <option value="">Select an event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            {events.length === 0 && (
              <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", marginTop: "6px" }}>
                No events yet. Create one from Create an event.
              </p>
            )}
          </div>

          {hasKey ? (
            <>
              {/* Drawing tools */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                {([
                  { m: "point" as DrawMode, label: "Pin", icon: IconPointer },
                  { m: "circle" as DrawMode, label: "Circle", icon: IconCircle },
                  { m: "polygon" as DrawMode, label: "Polygon", icon: IconPolygon },
                ]).map(({ m, label, icon: Icon }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDrawMode(m)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "7px 12px", borderRadius: "8px",
                      border: drawMode === m ? "2px solid var(--db-accent)" : "1px solid var(--db-border)",
                      background: drawMode === m ? "var(--db-accent-bg)" : "var(--db-bg-elevated)",
                      color: drawMode === m ? "var(--db-accent)" : "var(--db-text-secondary)",
                      fontSize: "13px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => clearRef.current()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "8px", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)", color: "var(--db-danger)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  <IconTrash size={14} /> Clear
                </button>
              </div>

              <div style={{ height: "360px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--db-border)" }}>
                <APIProvider apiKey={MAPS_KEY}>
                  <GMap
                    mapId={MAP_ID}
                    defaultCenter={center}
                    defaultZoom={15}
                    gestureHandling="greedy"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <EventDrawer
                      mode={drawMode}
                      onChange={(c, poly) => { setEventCentroid(c); setEventPolygon(poly); }}
                      registerClear={(fn) => { clearRef.current = fn; }}
                    />
                  </GMap>
                </APIProvider>
              </div>
              <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: "10px 0 16px" }}>
                Draw the event area in blue. {eventCentroid ? `Center: ${eventCentroid.lat.toFixed(5)}, ${eventCentroid.lng.toFixed(5)}` : "Nothing drawn yet."}
              </p>
            </>
          ) : (
            <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "8px 0 16px" }}>
              Drawing tools require the Google Maps key. Add{" "}
              <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to enable Pin / Circle / Polygon.
            </p>
          )}

          <SaveBtn onClick={() => void saveEvent()} loading={savingEvent} label="Save Event Area" disabled={!eventId} />
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

function SaveBtn({ onClick, loading, label, disabled }: { onClick: () => void; loading: boolean; label: string; disabled?: boolean }) {
  const dis = loading || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dis}
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: "9px 18px", borderRadius: "8px", border: "none",
        background: dis ? "var(--db-text-tertiary)" : "var(--db-accent)",
        color: "var(--db-accent-text)", fontSize: "14px", fontWeight: 600,
        cursor: dis ? "not-allowed" : "pointer",
      }}
    >
      <IconCheck size={15} />
      {loading ? "Saving…" : label}
    </button>
  );
}
