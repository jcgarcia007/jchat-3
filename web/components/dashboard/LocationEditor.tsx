"use client";

/**
 * JChat 3.0 — Location & Geofence editor (lives inside the Settings page).
 *
 * Business mode: draggable pin + Places Autocomplete + radius slider/circle →
 *   saves businesses.latitude/longitude/geofence_radius_m (mirrors legacy
 *   lat/lng/radius_m so the map + nearby stay in sync).
 * Event mode: pick an event and draw a Pin / Circle / Polygon →
 *   saves events.location_lat/location_lng/geofence_polygon (JSONB GeoJSON).
 *
 * Maps: @vis.gl/react-google-maps for the canvas + hooks; all overlays
 * (pin/circle/polygon) use native google.maps primitives managed imperatively
 * via useMap() with strict null-checks and guarded cleanup — no AdvancedMarker
 * (avoids the mapId requirement) and no terra-draw (avoids its fragile adapter
 * cleanup that threw "Cannot read properties of undefined (reading 'remove')").
 *
 * Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY; degrades to manual lat/lng inputs without it.
 * Colors: --db-* tokens (the canvas overlay reads --db-accent at runtime).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map as GMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
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
const DEFAULT_CENTER = { lat: 25.7617, lng: -80.1918 };

type LatLng = { lat: number; lng: number };
type DrawMode = "point" | "circle" | "polygon";

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

/** Approximate a circle as a GeoJSON polygon ring (for geofence_polygon). */
function circleToGeoJson(center: LatLng, radiusM: number, points = 36) {
  const latDeg = radiusM / 111320;
  const lngDeg = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180) || 1);
  const ring: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    ring.push([center.lng + lngDeg * Math.cos(a), center.lat + latDeg * Math.sin(a)]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// ── Business: draggable pin (native marker, no mapId needed) ─────────────────────
function DraggablePin({ position, onMove }: { position: LatLng; onMove: (p: LatLng) => void }) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const marker = new google.maps.Marker({ map, position, draggable: true });
    markerRef.current = marker;
    const listener = marker.addListener("dragend", () => {
      const p = marker.getPosition();
      if (p) onMove({ lat: p.lat(), lng: p.lng() });
    });
    return () => {
      if (listener) google.maps.event.removeListener(listener);
      marker.setMap(null);
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Keep marker in sync when position is set externally (search / props).
  useEffect(() => {
    markerRef.current?.setPosition(position);
  }, [position]);

  return null;
}

// ── Business: radius circle overlay ─────────────────────────────────────────────
function RadiusCircle({ center, radius }: { center: LatLng; radius: number }) {
  const map = useMap();
  const ref = useRef<google.maps.Circle | null>(null);
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const accent = accentColor();
    const circle = new google.maps.Circle({
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
    ref.current = circle;
    return () => {
      circle.setMap(null);
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.setCenter(center);
    ref.current.setRadius(radius);
  }, [center, radius]);
  return null;
}

// ── Business: Places Autocomplete search box ────────────────────────────────────
function PlacesSearch({ onPlace }: { onPlace: (p: LatLng) => void }) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current || typeof google === "undefined") return;
    const ac = new places.Autocomplete(inputRef.current, { fields: ["geometry"] });
    const listener = ac.addListener("place_changed", () => {
      const loc = ac.getPlace().geometry?.location;
      if (loc) onPlace({ lat: loc.lat(), lng: loc.lng() });
    });
    return () => {
      if (listener) google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(ac);
    };
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

// ── Event: native drawing (Pin / Circle / Polygon) ──────────────────────────────
function EventDrawer({
  mode,
  onChange,
  registerClear,
}: {
  mode: DrawMode;
  onChange: (centroid: LatLng | null, polygon: unknown | null) => void;
  registerClear: (fn: () => void) => void;
}) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const pathRef = useRef<LatLng[]>([]);
  const modeRef = useRef<DrawMode>(mode);
  modeRef.current = mode;

  const clearAll = useCallback(() => {
    markerRef.current?.setMap(null);
    markerRef.current = null;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    pathRef.current = [];
    onChange(null, null);
  }, [onChange]);

  // Clear existing shapes when switching tool (one area at a time).
  useEffect(() => {
    clearAll();
  }, [mode, clearAll]);

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const accent = accentColor();
    registerClear(clearAll);

    const emit = () => {
      const m = modeRef.current;
      if (m === "point" && markerRef.current) {
        const p = markerRef.current.getPosition();
        if (p) onChange({ lat: p.lat(), lng: p.lng() }, null);
        return;
      }
      if (m === "circle" && circleRef.current) {
        const c = circleRef.current.getCenter();
        if (c) onChange({ lat: c.lat(), lng: c.lng() }, circleToGeoJson({ lat: c.lat(), lng: c.lng() }, circleRef.current.getRadius()));
        return;
      }
      if (m === "polygon" && pathRef.current.length > 0) {
        const pts = pathRef.current;
        const sx = pts.reduce((s, p) => s + p.lng, 0);
        const sy = pts.reduce((s, p) => s + p.lat, 0);
        const ring = pts.map((p) => [p.lng, p.lat]);
        if (ring.length > 0) ring.push(ring[0]);
        onChange({ lat: sy / pts.length, lng: sx / pts.length }, { type: "Polygon", coordinates: [ring] });
        return;
      }
      onChange(null, null);
    };

    const clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      const pos: LatLng = { lat: ll.lat(), lng: ll.lng() };
      const m = modeRef.current;

      if (m === "point") {
        if (!markerRef.current) {
          markerRef.current = new google.maps.Marker({ map, position: ll, draggable: true });
          markerRef.current.addListener("dragend", emit);
        } else {
          markerRef.current.setPosition(ll);
        }
        emit();
      } else if (m === "circle") {
        if (!circleRef.current) {
          circleRef.current = new google.maps.Circle({
            map,
            center: ll,
            radius: 200,
            editable: true,
            draggable: true,
            strokeColor: accent,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: accent,
            fillOpacity: 0.2,
          });
          circleRef.current.addListener("radius_changed", emit);
          circleRef.current.addListener("center_changed", emit);
        } else {
          circleRef.current.setCenter(ll);
        }
        emit();
      } else if (m === "polygon") {
        pathRef.current = [...pathRef.current, pos];
        const gpath = pathRef.current.map((p) => ({ lat: p.lat, lng: p.lng }));
        if (!polygonRef.current) {
          polygonRef.current = new google.maps.Polygon({
            map,
            paths: gpath,
            editable: true,
            strokeColor: accent,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: accent,
            fillOpacity: 0.2,
          });
        } else {
          polygonRef.current.setPath(gpath);
        }
        emit();
      }
    });

    return () => {
      if (clickListener) google.maps.event.removeListener(clickListener);
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      polygonRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      polygonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

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

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [savingBiz, setSavingBiz] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [drawMode, setDrawMode] = useState<DrawMode>("polygon");
  const [eventCentroid, setEventCentroid] = useState<LatLng | null>(null);
  const [eventPolygon, setEventPolygon] = useState<unknown | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const clearRef = useRef<() => void>(() => {});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
          .update({ latitude: lat, longitude: lng, geofence_radius_m: radius, lat, lng, radius_m: radius })
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
                  center={center}
                  defaultZoom={15}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  style={{ width: "100%", height: "100%" }}
                  onClick={(e) => {
                    const ll = e.detail.latLng;
                    if (ll) { setLat(ll.lat); setLng(ll.lng); }
                  }}
                >
                  <DraggablePin position={center} onMove={(p) => { setLat(p.lat); setLng(p.lng); }} />
                  <RadiusCircle center={center} radius={radius} />
                </GMap>
              </div>
              <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "6px 0 0" }}>
                Tip: click the map or drag the pin to move your location.
              </p>
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
                {drawMode === "polygon" ? "Click to add polygon points." : drawMode === "circle" ? "Click to place a circle, then drag/resize it." : "Click to drop a pin."}{" "}
                {eventCentroid ? `Center: ${eventCentroid.lat.toFixed(5)}, ${eventCentroid.lng.toFixed(5)}` : "Nothing drawn yet."}
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
