"use client";

/**
 * JChat 3.0 — Business Location & Geofence editor (inside the Settings page).
 *
 * Business location only: Places Autocomplete + draggable pin + radius slider
 * with a live circle overlay → saves businesses.latitude/longitude/
 * geofence_radius_m (mirrors legacy lat/lng/radius_m so the map + nearby stay
 * in sync). Event geofences are handled separately from /dashboard/events.
 *
 * Maps: @vis.gl/react-google-maps; overlays use native google.maps primitives
 * via useMap() with guarded cleanup. Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY; degrades
 * to manual lat/lng inputs without it. Colors: --db-* tokens (the canvas overlay
 * reads --db-accent at runtime).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map as GMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { IconMapPin, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
// Fallback view when the business has no saved coordinates: center of the USA.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

type LatLng = { lat: number; lng: number };

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

// ── Draggable pin (native marker, no mapId needed) ──────────────────────────────
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

  useEffect(() => {
    markerRef.current?.setPosition(position);
  }, [position]);

  return null;
}

// ── Radius circle overlay ───────────────────────────────────────────────────────
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

// ── Places Autocomplete search box ──────────────────────────────────────────────
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

// ── Main editor ─────────────────────────────────────────────────────────────────

export function LocationEditor({ businessId }: { businessId: string | null }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(200);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Imperative recenter target — set on load/search, NOT on pin drag/map click.
  const [recenterTo, setRecenterTo] = useState<LatLng | null>(null);

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

  // The pin is always visible: at the saved location, or the USA fallback.
  const pin: LatLng = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;

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
          .update({ latitude: lat, longitude: lng, geofence_radius_m: radius, lat, lng, radius_m: radius })
          .eq("id", businessId);
        if (e) throw e;
      }
      setSuccess("Location saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save location.");
    } finally {
      setSaving(false);
    }
  }, [businessId, lat, lng, radius]);

  const hasKey = MAPS_KEY.length > 0;

  // Shared controls below the map (radius slider, lat/lng, save).
  const controls = (
    <>
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
          <div style={{ height: "400px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--db-border)" }}>
            <GMap
              defaultCenter={pin}
              defaultZoom={lat != null && lng != null ? 15 : 4}
              gestureHandling="greedy"
              draggable
              scrollwheel
              disableDefaultUI={false}
              style={{ width: "100%", height: "400px" }}
              onClick={(e) => {
                const ll = e.detail.latLng;
                if (ll) { setLat(ll.lat); setLng(ll.lng); }
              }}
            >
              <DraggablePin position={pin} onMove={(p) => { setLat(p.lat); setLng(p.lng); }} />
              <RadiusCircle center={pin} radius={radius} />
              <Recenter target={recenterTo} />
            </GMap>
          </div>
          <p style={{ fontSize: "11px", color: "var(--db-text-tertiary)", margin: "6px 0 0" }}>
            Tip: click the map or drag the pin to move your location.
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
