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
// Fallback view when the business has no saved coordinates: center of the USA.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

type LatLng = { lat: number; lng: number };
type Tool = "pin" | "circle" | "polygon";

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

// ── Places Autocomplete search box ──────────────────────────────────────────────
function PlacesSearch({ onPlace }: { onPlace: (p: LatLng) => void }) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    if (!places || !inputRef.current || typeof google === "undefined") return;
    const ac = new places.Autocomplete(inputRef.current, { fields: ["geometry"] });
    const listener = ac.addListener("place_changed", () => {
      const loc = ac.getPlace().geometry?.location;
      if (loc) onPlaceRef.current({ lat: loc.lat(), lng: loc.lng() });
    });
    return () => {
      if (listener) google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(ac);
    };
  }, [places]);

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

// ── Unified geofence layer: pin + radius circle + drawn circle/polygon ──────────
function GeofenceLayer({
  tool,
  pin,
  radius,
  onPinMove,
  onShapeChange,
  registerClear,
}: {
  tool: Tool;
  pin: LatLng;
  radius: number;
  onPinMove: (p: LatLng) => void;
  onShapeChange: (geojson: unknown | null) => void;
  registerClear: (fn: () => void) => void;
}) {
  const map = useMap();
  const markerRef = useRef<google.maps.Marker | null>(null);
  const pinCircleRef = useRef<google.maps.Circle | null>(null); // pin-mode visual radius
  const circleRef = useRef<google.maps.Circle | null>(null); // circle tool
  const polygonRef = useRef<google.maps.Polygon | null>(null); // polygon tool
  const pathRef = useRef<LatLng[]>([]);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const onPinMoveRef = useRef(onPinMove);
  onPinMoveRef.current = onPinMove;
  const onShapeRef = useRef(onShapeChange);
  onShapeRef.current = onShapeChange;

  const emitShape = useCallback(() => {
    const t = toolRef.current;
    if (t === "circle" && circleRef.current) {
      const c = circleRef.current.getCenter();
      if (c) onShapeRef.current({ type: "Circle", center: [c.lng(), c.lat()], radius: circleRef.current.getRadius() });
      return;
    }
    if (t === "polygon" && polygonRef.current) {
      const path = polygonRef.current.getPath();
      const coords: LatLng[] = [];
      path.forEach((ll) => coords.push({ lat: ll.lat(), lng: ll.lng() }));
      if (coords.length > 0) {
        onShapeRef.current({ type: "Polygon", coordinates: [coords] });
        return;
      }
    }
    onShapeRef.current(null);
  }, []);

  const clearShapes = useCallback(() => {
    circleRef.current?.setMap(null);
    circleRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    pathRef.current = [];
    onShapeRef.current(null);
  }, []);

  // Init marker + map listeners (once the map is ready).
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const accent = accentColor();

    const marker = new google.maps.Marker({ map, position: pin, draggable: true });
    markerRef.current = marker;
    const dragL = marker.addListener("dragend", () => {
      const p = marker.getPosition();
      if (p) onPinMoveRef.current({ lat: p.lat(), lng: p.lng() });
    });

    const clickL = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      const pos: LatLng = { lat: ll.lat(), lng: ll.lng() };
      const t = toolRef.current;

      if (t === "pin") {
        onPinMoveRef.current(pos);
      } else if (t === "circle") {
        if (!circleRef.current) {
          const circle = new google.maps.Circle({
            map,
            center: ll,
            radius: radiusRef.current,
            editable: true,
            draggable: true,
            strokeColor: accent,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: accent,
            fillOpacity: 0.2,
          });
          circle.addListener("radius_changed", emitShape);
          circle.addListener("center_changed", () => {
            const c = circle.getCenter();
            if (c) onPinMoveRef.current({ lat: c.lat(), lng: c.lng() });
            emitShape();
          });
          circleRef.current = circle;
          onPinMoveRef.current(pos); // pin follows the circle center
        } else {
          circleRef.current.setCenter(ll);
        }
        emitShape();
      } else if (t === "polygon") {
        pathRef.current = [...pathRef.current, pos];
        const gpath = pathRef.current.map((p) => ({ lat: p.lat, lng: p.lng }));
        if (!polygonRef.current) {
          const poly = new google.maps.Polygon({
            map,
            paths: gpath,
            editable: true,
            strokeColor: accent,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: accent,
            fillOpacity: 0.2,
          });
          const pp = poly.getPath();
          pp.addListener("set_at", emitShape);
          pp.addListener("insert_at", emitShape);
          pp.addListener("remove_at", emitShape);
          polygonRef.current = poly;
        } else {
          polygonRef.current.setPath(gpath);
        }
        emitShape();
      }
    });

    const dblL = map.addListener("dblclick", () => {
      if (toolRef.current === "polygon") emitShape();
    });

    registerClear(clearShapes);

    return () => {
      google.maps.event.removeListener(dragL);
      google.maps.event.removeListener(clickL);
      google.maps.event.removeListener(dblL);
      marker.setMap(null);
      markerRef.current = null;
      pinCircleRef.current?.setMap(null);
      pinCircleRef.current = null;
      circleRef.current?.setMap(null);
      circleRef.current = null;
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
    };
    // Init once when the map is ready; pin syncs via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, emitShape, clearShapes, registerClear]);

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

  // Slider resizes the drawn circle while in circle mode.
  useEffect(() => {
    if (tool === "circle" && circleRef.current) {
      circleRef.current.setRadius(radius);
      emitShape();
    }
  }, [radius, tool, emitShape]);

  return null;
}

// ── Main editor ─────────────────────────────────────────────────────────────────

export function LocationEditor({ businessId }: { businessId: string | null }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [tool, setTool] = useState<Tool>("pin");
  const [shape, setShape] = useState<unknown | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null);
  const clearRef = useRef<() => void>(() => {});

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
        setLat(blat);
        setLng(blng);
        setRadius(row.geofence_radius_m ?? row.radius_m ?? 200);
        if (blat != null && blng != null) setRecenterTo({ lat: blat, lng: blng });
      }
    })();
    return () => {
      active = false;
    };
  }, [businessId]);

  const pin: LatLng = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

  const registerClear = useCallback((fn: () => void) => {
    clearRef.current = fn;
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
            geofence_polygon: shape ?? null,
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
      setSaving(false);
    }
  }, [businessId, lat, lng, radius, shape]);

  const hasKey = MAPS_KEY.length > 0;

  const TOOLS: { id: Tool; label: string; icon: typeof IconPointer }[] = [
    { id: "pin", label: "Pin", icon: IconMapPin },
    { id: "circle", label: "Circle", icon: IconCircle },
    { id: "polygon", label: "Polygon", icon: IconPolygon },
  ];

  const controls = (
    <>
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <FieldLabel>Geofence radius{tool === "circle" ? " (circle)" : ""}</FieldLabel>
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
        {shape ? ` · ${(shape as { type: string }).type} geofence drawn` : ""}
      </p>

      <SaveBtn onClick={() => void saveBusiness()} loading={saving} label="Save Location" />
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
        <APIProvider apiKey={MAPS_KEY}>
          <div style={{ marginBottom: "12px" }}>
            <PlacesSearch onPlace={(p) => { setLat(p.lat); setLng(p.lng); setRecenterTo(p); }} />
          </div>

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
              <IconTrash size={14} /> Clear
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
                onShapeChange={setShape}
                registerClear={registerClear}
              />
              <Recenter target={recenterTo} />
            </GMap>
          </div>
          <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "6px 0 0" }}>
            {tool === "pin"
              ? "Pin: click the map or drag the marker to set your location."
              : tool === "circle"
                ? "Circle: click to place, then drag/resize. Slider sets the radius."
                : "Polygon: click to add points, double-click to close."}
          </p>
          {controls}
        </APIProvider>
      ) : (
        <>
          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(245,158,11,0.10)", color: "var(--db-warning)", fontSize: "13px", marginBottom: "12px" }}>
            Set <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in .env.local to enable the interactive map. You can still set coordinates manually below.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <FieldLabel>Latitude</FieldLabel>
              <NumberInput value={lat} onChange={setLat} placeholder="25.7617" />
            </div>
            <div>
              <FieldLabel>Longitude</FieldLabel>
              <NumberInput value={lng} onChange={setLng} placeholder="-80.1918" />
            </div>
          </div>
          {controls}
        </>
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
      {loading ? "Saving…" : label}
    </button>
  );
}
