"use client";

/**
 * JChat 3.0 — Mesas (table registry, Fase A). Lives in the PEDIDOS module.
 *
 * CRUD over public.tables for the ACTIVE business. This registry unblocks the
 * visual floor plan (Fase B) and POS flow (Fase C), and turns "% occupancy"
 * into a real metric.
 *
 * NOTE: a table's `label` must match what gets stored in orders.table_label
 * (free text today) so Fase B can cross-reference occupancy. We do NOT migrate
 * orders.table_label here — that stays free text for now.
 *
 * Honest states (same lesson as SalesCalendar): a load FAILURE must never look
 * like "no tables". Tokens: --db-* only.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconPlus,
  IconMinus,
  IconPencil,
  IconTrash,
  IconDeviceFloppy,
  IconX,
  IconUsers,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useActiveBusinessName } from "@/components/dashboard/useActiveBusinessName";

interface TableRow {
  id: string;
  label: string;
  floor: string;
  seats: number;
  sort: number;
  is_active: boolean;
}

const DEFAULT_FLOOR = "Principal";

interface FormState {
  id: string | null; // null = creating
  label: string;
  floor: string;
  seats: string; // kept as string for the input; validated to 1-50
  is_active: boolean;
}

const EMPTY_FORM: FormState = { id: null, label: "", floor: DEFAULT_FLOOR, seats: "4", is_active: true };

export default function TablesPage() {
  const { id: activeId } = useActiveBusinessName();

  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<FormState | null>(null); // null = closed
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick +/- seat adjust: per-table in-flight lock (a Set, so different tables
  // can be adjusted concurrently but the SAME table can't chain writes) and a
  // shared error line for a failed save.
  const [savingSeats, setSavingSeats] = useState<Set<string>>(new Set());
  const [seatError, setSeatError] = useState<string | null>(null);

  // Assigned-waiter count per table (B4), shown on each card. Read-only tally.
  const [waiterCounts, setWaiterCounts] = useState<Record<string, number>>({});

  const loadWaiterCounts = useCallback(async () => {
    if (!activeId || !isSupabaseConfigured) {
      setWaiterCounts({});
      return;
    }
    const { data, error } = await supabase
      .from("table_waiters")
      .select("table_id")
      .eq("business_id", activeId);
    if (error) return; // non-critical chrome: leave counts as-is
    const acc: Record<string, number> = {};
    for (const r of (data ?? []) as { table_id: string }[]) {
      acc[r.table_id] = (acc[r.table_id] ?? 0) + 1;
    }
    setWaiterCounts(acc);
  }, [activeId]);

  const load = useCallback(async () => {
    if (!activeId || !isSupabaseConfigured) {
      setRows([]);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("tables")
      .select("id, label, floor, seats, sort, is_active")
      .eq("business_id", activeId)
      .order("floor", { ascending: true })
      .order("sort", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      setRows([]);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as TableRow[]);
    setLoadError(false);
    setLoading(false);
  }, [activeId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (!active) return;
      await loadWaiterCounts();
    })();
    return () => {
      active = false;
    };
  }, [load, loadWaiterCounts, reloadKey]);

  // Floors present, in first-seen order; drives the optional grouping headers.
  const floors = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.floor)) seen.push(r.floor);
    return seen;
  }, [rows]);

  function openCreate() {
    setFormError(null);
    setForm({ ...EMPTY_FORM });
  }
  function openEdit(r: TableRow) {
    setFormError(null);
    setForm({ id: r.id, label: r.label, floor: r.floor, seats: String(r.seats), is_active: r.is_active });
  }
  function closeForm() {
    setForm(null);
    setFormError(null);
  }

  function validate(f: FormState): string | null {
    const label = f.label.trim();
    if (!label) return "La etiqueta es obligatoria.";
    if (label.length > 20) return "La etiqueta no puede superar 20 caracteres.";
    const seats = Number(f.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) return "Las sillas deben ser un número entre 1 y 50.";
    // Client-side duplicate check (case-insensitive), excluding the edited row.
    const dup = rows.some(
      (r) => r.id !== f.id && r.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (dup) return "Ya existe una mesa con esa etiqueta.";
    return null;
  }

  async function save() {
    if (!form || !activeId) return;
    const err = validate(form);
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);

    const label = form.label.trim();
    const floor = form.floor.trim() || DEFAULT_FLOOR;
    const seats = Number(form.seats);

    let dbError: { code?: string } | null = null;
    if (form.id === null) {
      // Append after the current max sort so new tables land at the end.
      const nextSort = rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
      const { error } = await supabase
        .from("tables")
        .insert({ business_id: activeId, label, floor, seats, sort: nextSort, is_active: form.is_active });
      dbError = error;
    } else {
      const { error } = await supabase
        .from("tables")
        .update({ label, floor, seats, is_active: form.is_active })
        .eq("id", form.id);
      dbError = error;
    }

    setSaving(false);

    if (dbError) {
      // Postgres unique_violation (business_id, lower(label)) → friendly copy.
      setFormError(
        dbError.code === "23505"
          ? "Ya existe una mesa con esa etiqueta."
          : "No se pudo guardar la mesa. Inténtalo de nuevo.",
      );
      return;
    }

    closeForm();
    await load();
  }

  async function remove(r: TableRow) {
    if (!window.confirm(`¿Eliminar la mesa "${r.label}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("tables").delete().eq("id", r.id);
    if (!error) await load();
  }

  // Quick seat adjust (+/-), optimistic with rollback on DB error. Bounds match
  // the tables_seats_range CHECK (1-50) from migration 069 — never exceeded.
  async function adjustSeats(r: TableRow, delta: number) {
    const next = r.seats + delta;
    if (next < 1 || next > 50) return; // respect CHECK bounds
    if (savingSeats.has(r.id)) return; // a write is already in flight for this table

    const prev = r.seats;
    // Optimistic: the glyph + caption update instantly.
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, seats: next } : x)));
    setSavingSeats((s) => new Set(s).add(r.id));
    setSeatError(null);

    const { error } = await supabase.from("tables").update({ seats: next }).eq("id", r.id);

    setSavingSeats((s) => {
      const n = new Set(s);
      n.delete(r.id);
      return n;
    });

    if (error) {
      // Roll back so the screen never shows a value that wasn't saved.
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, seats: prev } : x)));
      setSeatError(`No se pudieron actualizar las sillas de "${r.label}". Inténtalo de nuevo.`);
    }
  }

  // ── States ─────────────────────────────────────────────────────────────────
  if (!activeId) {
    return <Shell><Notice>Selecciona un negocio para gestionar sus mesas.</Notice></Shell>;
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          Mesas
        </h1>
        <button type="button" onClick={openCreate} style={CTA}>
          <IconPlus size={18} /> Añadir mesa
        </button>
      </div>

      {form && (
        <TableForm
          form={form}
          saving={saving}
          error={formError}
          businessId={activeId}
          onChange={setForm}
          onSave={() => void save()}
          onCancel={closeForm}
          onWaitersChanged={() => void loadWaiterCounts()}
        />
      )}

      {seatError && (
        <div style={{ fontSize: "13px", color: "var(--db-danger)", marginBottom: "12px" }}>
          {seatError}
        </div>
      )}

      {loading ? (
        <Notice>Cargando…</Notice>
      ) : loadError ? (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <p style={{ color: "var(--db-danger)", fontSize: "14px", margin: "0 0 10px" }}>
            No se pudieron cargar las mesas. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={SECONDARY_BTN}>
            Reintentar
          </button>
        </div>
      ) : rows.length === 0 ? (
        <Notice>Aún no has registrado mesas.</Notice>
      ) : (
        floors.map((floor) => (
          <div key={floor} style={{ marginBottom: "28px" }}>
            {floors.length > 1 && (
              <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--db-text-tertiary)", margin: "0 0 12px" }}>
                {floor}
              </h2>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "14px",
              }}
            >
              {rows.filter((r) => r.floor === floor).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    padding: "16px 12px",
                    borderRadius: "14px",
                    background: "var(--db-bg-surface)",
                    border: "1px solid var(--db-border)",
                    opacity: r.is_active ? 1 : 0.5,
                  }}
                >
                  <TableGlyph label={r.label} seats={r.seats} />

                  <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
                    {r.seats} {r.seats === 1 ? "silla" : "sillas"}
                  </div>
                  {(() => {
                    const wc = waiterCounts[r.id] ?? 0;
                    return (
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: wc === 0 ? "var(--db-warning)" : "var(--db-text-tertiary)",
                        }}
                      >
                        {wc === 0 ? "Sin mesero" : `${wc} ${wc === 1 ? "mesero" : "meseros"}`}
                      </div>
                    );
                  })()}
                  {!r.is_active && (
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--db-text-tertiary)" }}>
                      Inactiva
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                    {(() => {
                      const busy = savingSeats.has(r.id);
                      const minusDisabled = busy || r.seats <= 1;
                      const plusDisabled = busy || r.seats >= 50;
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => void adjustSeats(r, -1)}
                            disabled={minusDisabled}
                            aria-label={`Quitar una silla de ${r.label}`}
                            title={`Quitar una silla de ${r.label}`}
                            style={{ ...ICON_BTN, opacity: minusDisabled ? 0.4 : 1, cursor: minusDisabled ? "default" : "pointer" }}
                          >
                            <IconMinus size={16} />
                          </button>
                          <button type="button" onClick={() => openEdit(r)} aria-label={`Editar ${r.label}`} style={ICON_BTN}>
                            <IconPencil size={16} />
                          </button>
                          <button type="button" onClick={() => void remove(r)} aria-label={`Eliminar ${r.label}`} style={{ ...ICON_BTN, color: "var(--db-danger)" }}>
                            <IconTrash size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void adjustSeats(r, 1)}
                            disabled={plusDisabled}
                            aria-label={`Añadir una silla a ${r.label}`}
                            title={`Añadir una silla a ${r.label}`}
                            style={{ ...ICON_BTN, opacity: plusDisabled ? 0.4 : 1, cursor: plusDisabled ? "default" : "pointer" }}
                          >
                            <IconPlus size={16} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Shell>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: "720px" }}>{children}</div>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--db-text-secondary)",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "14px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Visual table glyph: a central circle (the table) with the label inside, and
 * `seats` chairs drawn as 45°-rotated rounded squares evenly around it. Chairs
 * reflect the REAL seat count. To avoid clutter, at most 10 chairs are drawn;
 * the exact count always shows in the caption below the glyph. Tokens only.
 */
function TableGlyph({ label, seats }: { label: string; seats: number }) {
  const SIZE = 180;
  const C = SIZE / 2; // center
  const RING = 58; // chair distance from center
  const drawn = Math.max(1, Math.min(seats, 10)); // cap drawn chairs at 10
  const chairs = Array.from({ length: drawn }, (_, i) => {
    // -45° offset so 4 chairs land on the diagonals (matches the reference).
    const rad = (((360 / drawn) * i - 45) * Math.PI) / 180;
    return { cx: C + RING * Math.cos(rad), cy: C + RING * Math.sin(rad) };
  });

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="150"
      height="150"
      role="img"
      aria-label={`Mesa ${label}, ${seats} ${seats === 1 ? "silla" : "sillas"}`}
    >
      {chairs.map((ch, i) => (
        <rect
          key={i}
          x={ch.cx - 13}
          y={ch.cy - 13}
          width={26}
          height={26}
          rx={6}
          transform={`rotate(45 ${ch.cx} ${ch.cy})`}
          style={{ fill: "transparent", stroke: "var(--db-border)", strokeWidth: 2 }}
        />
      ))}
      <circle cx={C} cy={C} r={34} style={{ fill: "transparent", stroke: "var(--db-border)", strokeWidth: 2 }} />
      <text
        x={C}
        y={C}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: "var(--db-accent)", fontSize: "15px", fontWeight: 600 }}
      >
        {label}
      </text>
    </svg>
  );
}

function TableForm({
  form,
  saving,
  error,
  businessId,
  onChange,
  onSave,
  onCancel,
  onWaitersChanged,
}: {
  form: FormState;
  saving: boolean;
  error: string | null;
  businessId: string | null;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onWaitersChanged: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      style={{
        padding: "18px",
        borderRadius: "14px",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--db-text-primary)" }}>
        {form.id === null ? "Nueva mesa" : "Editar mesa"}
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <label style={FIELD}>
          <span style={LABEL}>Etiqueta</span>
          <input
            value={form.label}
            onChange={(e) => onChange({ ...form, label: e.target.value })}
            maxLength={20}
            placeholder="T1, Mesa 5"
            style={INPUT}
            autoFocus
          />
        </label>
        <label style={FIELD}>
          <span style={LABEL}>Piso / zona</span>
          <input
            value={form.floor}
            onChange={(e) => onChange({ ...form, floor: e.target.value })}
            maxLength={40}
            placeholder={DEFAULT_FLOOR}
            style={INPUT}
          />
        </label>
        <label style={{ ...FIELD, maxWidth: "120px" }}>
          <span style={LABEL}>Sillas</span>
          <input
            type="number"
            min={1}
            max={50}
            value={form.seats}
            onChange={(e) => onChange({ ...form, seats: e.target.value })}
            style={INPUT}
          />
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--db-text-secondary)" }}>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => onChange({ ...form, is_active: e.target.checked })}
        />
        Mesa activa
      </label>

      {error && <div style={{ fontSize: "13px", color: "var(--db-danger)" }}>{error}</div>}

      {/* Waiter assignment — only when editing an existing table (needs its id).
          Saves immediately per checkbox (independent of the table-field Guardar). */}
      {form.id !== null && businessId && (
        <WaiterAssignment tableId={form.id} businessId={businessId} onChanged={onWaitersChanged} />
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" disabled={saving} style={{ ...CTA, opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}>
          <IconDeviceFloppy size={17} /> {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} style={SECONDARY_BTN}>
          <IconX size={16} /> Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Waiter assignment (B4) ───────────────────────────────────────────────────
// Lists the business's ACCEPTED employees with a checkbox each; checking/
// unchecking inserts/deletes a table_waiters row immediately (per-row lock).
// Only employee_id + table_id are written (business_id is set by the 070
// trigger). RLS is the real gate (owner/admin only); this page is already
// owner-scoped (it operates on resolveActiveBusiness → the user's own business),
// so the UI shows here — a rejected write reverts and shows a friendly message.

interface AssignEmployee {
  employeeId: string;
  name: string;
  role: string;
}

function WaiterAssignment({
  tableId,
  businessId,
  onChanged,
}: {
  tableId: string;
  businessId: string;
  onChanged: () => void;
}) {
  const [employees, setEmployees] = useState<AssignEmployee[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        // Accepted employees of the business + their profile names, plus the
        // current assignments for this table.
        const [empRes, waRes] = await Promise.all([
          supabase
            .from("employees")
            .select("id, user_id, role")
            .eq("business_id", businessId)
            .eq("status", "accepted"),
          supabase.from("table_waiters").select("employee_id").eq("table_id", tableId),
        ]);
        if (empRes.error || waRes.error) throw empRes.error ?? waRes.error;

        const emps = (empRes.data ?? []) as { id: string; user_id: string; role: string }[];
        const userIds = [...new Set(emps.map((e) => e.user_id))];
        let names = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("public_profiles")
            .select("id, username, display_name")
            .in("id", userIds);
          names = new Map(
            ((profs ?? []) as { id: string; username: string; display_name: string | null }[]).map(
              (p) => [p.id, p.display_name ?? p.username],
            ),
          );
        }
        if (!active) return;
        setEmployees(
          emps.map((e) => ({ employeeId: e.id, name: names.get(e.user_id) ?? "—", role: e.role })),
        );
        setAssigned(new Set(((waRes.data ?? []) as { employee_id: string }[]).map((w) => w.employee_id)));
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tableId, businessId]);

  async function toggle(employeeId: string, checked: boolean) {
    if (savingIds.has(employeeId)) return;
    setError(null);
    // Optimistic
    setAssigned((s) => {
      const n = new Set(s);
      if (checked) n.add(employeeId);
      else n.delete(employeeId);
      return n;
    });
    setSavingIds((s) => new Set(s).add(employeeId));

    // business_id is intentionally omitted: the 070 trigger sets it from the
    // table, and the client isn't granted that column. The generated Insert type
    // marks it required (NOT NULL, no default), so cast past it.
    const insertPayload = { table_id: tableId, employee_id: employeeId } as never;
    const { error: dbErr } = checked
      ? await supabase.from("table_waiters").insert(insertPayload)
      : await supabase.from("table_waiters").delete().eq("table_id", tableId).eq("employee_id", employeeId);

    setSavingIds((s) => {
      const n = new Set(s);
      n.delete(employeeId);
      return n;
    });

    if (dbErr) {
      // Roll back the optimistic change.
      setAssigned((s) => {
        const n = new Set(s);
        if (checked) n.delete(employeeId);
        else n.add(employeeId);
        return n;
      });
      const code = (dbErr as { code?: string }).code;
      setError(
        code === "23505"
          ? "Ese mesero ya estaba asignado."
          : code === "42501"
            ? "No tienes permiso para asignar meseros a esta mesa."
            : "No se pudo actualizar la asignación. Inténtalo de nuevo.",
      );
      return;
    }
    onChanged(); // refresh the card counts
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--db-border)",
        paddingTop: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)" }}>
        <IconUsers size={16} /> Meseros asignados
      </div>

      {loading ? (
        <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>Cargando…</div>
      ) : loadError ? (
        <div style={{ fontSize: "13px", color: "var(--db-danger)" }}>
          No se pudieron cargar los empleados.
        </div>
      ) : employees.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--db-text-secondary)" }}>
          Este negocio no tiene empleados todavía.{" "}
          <Link href="/dashboard/employees" style={{ color: "var(--db-accent)", fontWeight: 600 }}>
            Añadir empleados
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {employees.map((emp) => {
            const isAssigned = assigned.has(emp.employeeId);
            const busy = savingIds.has(emp.employeeId);
            return (
              <label
                key={emp.employeeId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "14px",
                  color: "var(--db-text-primary)",
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isAssigned}
                  disabled={busy}
                  onChange={(e) => void toggle(emp.employeeId, e.target.checked)}
                />
                <span style={{ flex: 1 }}>{emp.name}</span>
                <span style={{ fontSize: "12px", color: "var(--db-text-tertiary)" }}>{emp.role}</span>
              </label>
            );
          })}
        </div>
      )}

      {error && <div style={{ fontSize: "13px", color: "var(--db-danger)" }}>{error}</div>}
    </div>
  );
}

// ── Styles (--db-* tokens only) ──────────────────────────────────────────────

const CTA: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 18px",
  borderRadius: "10px",
  background: "var(--db-accent)",
  color: "var(--db-accent-text)",
  fontSize: "14px",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const SECONDARY_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 16px",
  borderRadius: "10px",
  background: "transparent",
  color: "var(--db-text-primary)",
  border: "1px solid var(--db-border)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const ICON_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "34px",
  height: "34px",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--db-text-secondary)",
  border: "1px solid var(--db-border)",
  cursor: "pointer",
  flexShrink: 0,
};

const FIELD: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  flex: "1 1 160px",
};

const LABEL: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--db-text-secondary)",
};

const INPUT: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: "8px",
  border: "1px solid var(--db-border)",
  background: "var(--db-bg-base)",
  color: "var(--db-text-primary)",
  fontSize: "14px",
};
