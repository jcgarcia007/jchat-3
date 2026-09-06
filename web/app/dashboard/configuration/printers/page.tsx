"use client";

/**
 * /dashboard/configuration/printers
 * Gestión de impresoras por rol: Kitchen Station, Bar Station (únicas por negocio)
 * + impresoras de recibos (CRUD completo, múltiples, una favorita).
 *
 * Sección A — Comandas: Kitchen Station + Bar Station (role='kitchen' / 'bar')
 * Sección B — Recibos:  lista dinámica (role='receipt'), CRUD completo
 *
 * Conexión: red TCP / ESC-POS únicamente (Bluetooth = próximamente).
 * NUNCA aplica migraciones — la BD ya está en producción.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconBluetooth,
  IconCheck,
  IconChevronRight,
  IconEdit,
  IconLoader2,
  IconPrinter,
  IconStar,
  IconStarFilled,
  IconToggleLeft,
  IconToggleRight,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";

// ── Types ─────────────────────────────────────────────────────────────────────
type PrinterRow = {
  id: string;
  label: string;
  host: string | null;
  port: number;
  width_mm: number;
  is_default: boolean;
  is_active: boolean;
  role: string;
};

type CommandaFormState = {
  host: string;
  port: string;
  width: "80" | "58";
  error: string | null;
  loading: boolean;
};

type ReceiptFormState = {
  label: string;
  host: string;
  port: string;
  width: "80" | "58";
  isDefault: boolean;
  error: string | null;
  loading: boolean;
};

const EMPTY_COMMANDA_FORM: CommandaFormState = {
  host: "",
  port: "9100",
  width: "80",
  error: null,
  loading: false,
};

const EMPTY_RECEIPT_FORM: ReceiptFormState = {
  label: "",
  host: "",
  port: "9100",
  width: "80",
  isDefault: false,
  error: null,
  loading: false,
};

// ── Validation ────────────────────────────────────────────────────────────────
function validateIpPort(host: string, port: string): string | null {
  if (!host.trim()) return "La IP es requerida / IP is required";
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host.trim()))
    return "IP inválida. Formato: 192.168.1.100";
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535)
    return "Puerto inválido (1–65535) / Invalid port (1–65535)";
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PrintersPage() {
  const [bizId, setBizId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Section A — Comandas
  const [kitchenPrinter, setKitchenPrinter] = useState<PrinterRow | null>(null);
  const [barPrinter, setBarPrinter] = useState<PrinterRow | null>(null);
  const [showKitchenForm, setShowKitchenForm] = useState(false);
  const [showBarForm, setShowBarForm] = useState(false);
  const [kitchenForm, setKitchenForm] = useState<CommandaFormState>(EMPTY_COMMANDA_FORM);
  const [barForm, setBarForm] = useState<CommandaFormState>(EMPTY_COMMANDA_FORM);
  const [editingKitchen, setEditingKitchen] = useState(false);
  const [editingBar, setEditingBar] = useState(false);
  const [togglingKitchen, setTogglingKitchen] = useState(false);
  const [togglingBar, setTogglingBar] = useState(false);

  // Section B — Recibos
  const [receiptPrinters, setReceiptPrinters] = useState<PrinterRow[]>([]);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptFormState>(EMPTY_RECEIPT_FORM);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    resolveActiveBusiness().then((res) => {
      if (!res.ok) {
        setInitError(res.message);
        setLoading(false);
        return;
      }
      setBizId(res.business.id);
    });
  }, []);

  // ── Load all printers ─────────────────────────────────────────────────────────
  const loadPrinters = useCallback(async () => {
    if (!bizId) return;
    setLoading(true);
    const { data } = await supabase
      .from("pos_printers")
      .select("id, label, host, port, width_mm, is_default, is_active, role")
      .eq("business_id", bizId)
      .eq("is_active", true)
      .order("created_at");

    setLoading(false);
    const rows = data ?? [];
    setKitchenPrinter(rows.find((p) => p.role === "kitchen") ?? null);
    setBarPrinter(rows.find((p) => p.role === "bar") ?? null);
    setReceiptPrinters(rows.filter((p) => p.role === "receipt"));
  }, [bizId]);

  useEffect(() => {
    if (bizId) loadPrinters();
  }, [bizId, loadPrinters]);

  // ── Commanda upsert ───────────────────────────────────────────────────────────
  const handleSaveCommanda = useCallback(
    async (
      role: "kitchen" | "bar",
      form: CommandaFormState,
      setForm: React.Dispatch<React.SetStateAction<CommandaFormState>>,
    ) => {
      const err = validateIpPort(form.host, form.port);
      if (err) {
        setForm((f) => ({ ...f, error: err }));
        return;
      }
      if (!bizId) return;
      setForm((f) => ({ ...f, loading: true, error: null }));

      const label = role === "kitchen" ? "Kitchen Station" : "Bar Station";
      const { error } = await supabase.from("pos_printers").upsert(
        {
          business_id: bizId,
          role,
          label,
          connection: "network",
          host: form.host.trim(),
          port: parseInt(form.port, 10),
          width_mm: parseInt(form.width, 10),
          is_default: false,
          is_active: true,
        },
        { onConflict: "business_id,role" },
      );

      setForm((f) => ({ ...f, loading: false }));
      if (error) {
        setForm((f) => ({ ...f, error: "Error al guardar. Intenta de nuevo." }));
        return;
      }

      if (role === "kitchen") { setShowKitchenForm(false); setEditingKitchen(false); }
      else { setShowBarForm(false); setEditingBar(false); }
      showToast(`${label} guardada`);
      loadPrinters();
    },
    [bizId, showToast, loadPrinters],
  );

  // ── Toggle commanda is_active ─────────────────────────────────────────────────
  const handleToggleCommanda = useCallback(
    async (printer: PrinterRow) => {
      if (!bizId) return;
      const isKitchen = printer.role === "kitchen";
      if (isKitchen) setTogglingKitchen(true);
      else setTogglingBar(true);

      await supabase
        .from("pos_printers")
        .update({ is_active: !printer.is_active })
        .eq("id", printer.id);

      if (isKitchen) setTogglingKitchen(false);
      else setTogglingBar(false);
      showToast(
        !printer.is_active
          ? "Impresora activada / Printer enabled"
          : "Impresora desactivada / Printer disabled",
      );
      loadPrinters();
    },
    [bizId, showToast, loadPrinters],
  );

  // ── Set default receipt ───────────────────────────────────────────────────────
  const handleSetDefault = useCallback(
    async (id: string) => {
      if (!bizId) return;
      setSettingDefaultId(id);
      await supabase
        .from("pos_printers")
        .update({ is_default: false })
        .eq("business_id", bizId)
        .eq("role", "receipt");
      await supabase
        .from("pos_printers")
        .update({ is_default: true })
        .eq("id", id);
      setSettingDefaultId(null);
      showToast("Impresora favorita actualizada / Default printer updated");
      loadPrinters();
    },
    [bizId, showToast, loadPrinters],
  );

  // ── Delete receipt (soft) ─────────────────────────────────────────────────────
  const handleDeleteReceipt = useCallback(
    async (id: string) => {
      if (!bizId) return;
      setDeletingId(id);
      await supabase
        .from("pos_printers")
        .update({ is_active: false })
        .eq("id", id)
        .eq("business_id", bizId);
      setDeletingId(null);
      showToast("Impresora eliminada / Printer removed");
      loadPrinters();
    },
    [bizId, showToast, loadPrinters],
  );

  // ── Add/edit receipt ──────────────────────────────────────────────────────────
  const handleSaveReceipt = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!bizId) return;
      const err = validateIpPort(receiptForm.host, receiptForm.port);
      if (err) {
        setReceiptForm((f) => ({ ...f, error: err }));
        return;
      }
      if (!receiptForm.label.trim()) {
        setReceiptForm((f) => ({ ...f, error: "El nombre es requerido / Name is required" }));
        return;
      }

      setReceiptForm((f) => ({ ...f, loading: true, error: null }));

      if (receiptForm.isDefault) {
        await supabase
          .from("pos_printers")
          .update({ is_default: false })
          .eq("business_id", bizId)
          .eq("role", "receipt");
      }

      let dbError: { message: string } | null = null;

      if (editingReceiptId) {
        const { error } = await supabase
          .from("pos_printers")
          .update({
            label: receiptForm.label.trim(),
            host: receiptForm.host.trim(),
            port: parseInt(receiptForm.port, 10),
            width_mm: parseInt(receiptForm.width, 10),
            is_default: receiptForm.isDefault,
          })
          .eq("id", editingReceiptId)
          .eq("business_id", bizId);
        dbError = error;
      } else {
        const { error } = await supabase.from("pos_printers").insert({
          business_id: bizId,
          role: "receipt",
          connection: "network",
          label: receiptForm.label.trim(),
          host: receiptForm.host.trim(),
          port: parseInt(receiptForm.port, 10),
          width_mm: parseInt(receiptForm.width, 10),
          is_default: receiptForm.isDefault,
          is_active: true,
        });
        dbError = error;
      }

      setReceiptForm((f) => ({ ...f, loading: false }));
      if (dbError) {
        setReceiptForm((f) => ({ ...f, error: "Error al guardar. Intenta de nuevo." }));
        return;
      }

      setReceiptForm(EMPTY_RECEIPT_FORM);
      setShowReceiptForm(false);
      setEditingReceiptId(null);
      showToast(
        editingReceiptId
          ? "Impresora actualizada / Printer updated"
          : "Impresora agregada / Printer added",
      );
      loadPrinters();
    },
    [bizId, receiptForm, editingReceiptId, showToast, loadPrinters],
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const openEditReceipt = (p: PrinterRow) => {
    setReceiptForm({
      label: p.label,
      host: p.host ?? "",
      port: String(p.port),
      width: p.width_mm === 58 ? "58" : "80",
      isDefault: p.is_default,
      error: null,
      loading: false,
    });
    setEditingReceiptId(p.id);
    setShowReceiptForm(true);
  };

  const openEditCommanda = (
    printer: PrinterRow,
    setForm: React.Dispatch<React.SetStateAction<CommandaFormState>>,
    setShow: (v: boolean) => void,
    setEditing: (v: boolean) => void,
  ) => {
    setForm({
      host: printer.host ?? "",
      port: String(printer.port),
      width: printer.width_mm === 58 ? "58" : "80",
      error: null,
      loading: false,
    });
    setShow(true);
    setEditing(true);
  };

  // ── Early returns ─────────────────────────────────────────────────────────────
  if (initError) {
    return (
      <div className="pr-init-error">
        <IconAlertCircle size={18} />
        <span>{initError}</span>
      </div>
    );
  }

  // ── Commanda card renderer ────────────────────────────────────────────────────
  const renderCommandaCard = (
    role: "kitchen" | "bar",
    emoji: string,
    titleEN: string,
    titleES: string,
    descEN: string,
    descES: string,
    printer: PrinterRow | null,
    showForm: boolean,
    setShowForm: (v: boolean) => void,
    form: CommandaFormState,
    setForm: React.Dispatch<React.SetStateAction<CommandaFormState>>,
    editing: boolean,
    setEditing: (v: boolean) => void,
    toggling: boolean,
  ) => (
    <div className={`pr-commanda-card ${printer ? "pr-commanda-configured" : ""}`}>
      <div className="pr-commanda-top">
        <div className="pr-commanda-title-row">
          <span className="pr-commanda-emoji" aria-hidden>{emoji}</span>
          <div>
            <strong className="pr-commanda-name">{titleEN} / {titleES}</strong>
            <p className="pr-commanda-desc">{descEN} / {descES}</p>
          </div>
        </div>

        {!showForm && (
          printer ? (
            <div className="pr-commanda-actions">
              {/* Toggle */}
              <button
                className="pr-toggle-btn"
                onClick={() => handleToggleCommanda(printer)}
                disabled={toggling}
                title={printer.is_active ? "Desactivar / Disable" : "Activar / Enable"}
                aria-label={printer.is_active ? "Desactivar" : "Activar"}
              >
                {toggling ? (
                  <IconLoader2 size={20} className="pr-spin" />
                ) : printer.is_active ? (
                  <IconToggleRight size={22} style={{ color: "#22C55E" }} />
                ) : (
                  <IconToggleLeft size={22} style={{ color: "var(--db-text-muted)" }} />
                )}
              </button>
              {/* Edit */}
              <button
                className="pr-icon-action"
                onClick={() =>
                  openEditCommanda(printer, setForm, setShowForm, setEditing)
                }
                title="Editar / Edit"
                aria-label="Editar"
              >
                <IconEdit size={16} />
              </button>
            </div>
          ) : (
            <button
              className="pr-configure-btn"
              onClick={() => { setShowForm(true); setEditing(false); }}
            >
              Configurar
              <IconChevronRight size={14} />
            </button>
          )
        )}
      </div>

      {printer && !showForm && (
        <p className="pr-commanda-addr">
          <span style={{ color: "var(--db-text-muted)", fontSize: "0.85rem" }}>
            🌐 {printer.host} : {printer.port} · {printer.width_mm}mm
            {!printer.is_active && (
              <span className="pr-badge-off">Desactivada / Off</span>
            )}
          </span>
        </p>
      )}

      {showForm && (
        <div className="pr-inline-form">
          <div className="pr-form-row">
            <label className="pr-label">
              IP
              <input
                className="pr-input"
                placeholder="192.168.1.100"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value, error: null }))}
              />
            </label>
            <label className="pr-label">
              Puerto / Port
              <input
                className="pr-input"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value, error: null }))}
              />
            </label>
            <label className="pr-label">
              Ancho / Width
              <select
                className="pr-input"
                value={form.width}
                onChange={(e) => setForm((f) => ({ ...f, width: e.target.value as "80" | "58" }))}
              >
                <option value="80">80mm</option>
                <option value="58">58mm</option>
              </select>
            </label>
          </div>

          {form.error && (
            <p className="pr-form-error">
              <IconAlertCircle size={13} /> {form.error}
            </p>
          )}

          <div className="pr-form-actions">
            <button
              type="button"
              className="pr-secondary-btn"
              onClick={() => { setShowForm(false); setForm(EMPTY_COMMANDA_FORM); setEditing(false); }}
              disabled={form.loading}
            >
              Cancelar / Cancel
            </button>
            <button
              type="button"
              className="pr-primary-btn"
              disabled={form.loading}
              onClick={() => handleSaveCommanda(role, form, setForm)}
            >
              {form.loading ? <IconLoader2 size={14} className="pr-spin" /> : null}
              Guardar / Save
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="pr-root">
      {/* Toast */}
      {toast && (
        <div className="pr-toast" role="status" aria-live="polite">
          <IconCheck size={15} />
          <span>{toast}</span>
        </div>
      )}

      {/* Page header */}
      <div className="pr-page-header">
        <h1 className="pr-page-title">
          <IconPrinter size={22} aria-hidden />
          Impresoras / Printers
        </h1>
        <p className="pr-page-subtitle">
          Configura las impresoras de red ESC/POS para comandas y recibos.
          {" "}Configure network ESC/POS printers for tickets and receipts.
        </p>
      </div>

      {/* ── Sección A — Comandas ───────────────────────────────────────────── */}
      <section className="pr-section">
        <h2 className="pr-section-title">
          Impresoras de Comandas / Order Ticket Printers
        </h2>
        <p className="pr-section-note">
          Una impresora por estación. Se imprime automáticamente al enviar la orden.
          {" "}One printer per station, prints automatically when an order is sent.
        </p>

        {loading ? (
          <div className="pr-loading">
            <IconLoader2 size={18} className="pr-spin" />
            Cargando… / Loading…
          </div>
        ) : (
          <div className="pr-commanda-list">
            {renderCommandaCard(
              "kitchen",
              "🍳",
              "Kitchen Station",
              "Cocina",
              "Prints the kitchen order ticket automatically.",
              "Imprime la comanda de cocina automáticamente.",
              kitchenPrinter,
              showKitchenForm,
              setShowKitchenForm,
              kitchenForm,
              setKitchenForm,
              editingKitchen,
              setEditingKitchen,
              togglingKitchen,
            )}
            {renderCommandaCard(
              "bar",
              "🍹",
              "Bar Station",
              "Bar",
              "Prints the bar order ticket automatically.",
              "Imprime la comanda del bar automáticamente.",
              barPrinter,
              showBarForm,
              setShowBarForm,
              barForm,
              setBarForm,
              editingBar,
              setEditingBar,
              togglingBar,
            )}
          </div>
        )}
      </section>

      {/* ── Sección B — Recibos ────────────────────────────────────────────── */}
      <section className="pr-section">
        <div className="pr-section-head">
          <h2 className="pr-section-title">
            Impresoras de Recibos / Receipt Printers
          </h2>
          {!showReceiptForm && (
            <button
              className="pr-peach-btn"
              onClick={() => {
                setReceiptForm(EMPTY_RECEIPT_FORM);
                setEditingReceiptId(null);
                setShowReceiptForm(true);
              }}
            >
              + Agregar estación de recibos / Add receipt station
            </button>
          )}
        </div>

        {loading ? (
          <div className="pr-loading">
            <IconLoader2 size={18} className="pr-spin" />
            Cargando… / Loading…
          </div>
        ) : receiptPrinters.length === 0 && !showReceiptForm ? (
          <p className="pr-empty-note">
            No hay impresoras de recibos configuradas. Agrega la IP de tu
            impresora de red (puerto 9100, ESC/POS) para imprimir recibos
            desde la app del mesero.{" "}
            No receipt printers configured. Add your network printer IP
            (port 9100, ESC/POS) to print receipts from the staff app.
          </p>
        ) : null}

        {!loading && receiptPrinters.map((p) => (
          <div
            key={p.id}
            className={`pr-receipt-card ${p.is_default ? "pr-receipt-default" : ""}`}
          >
            {p.is_default && (
              <span className="pr-default-badge">
                <IconStarFilled size={11} />
                Favorita / Default
              </span>
            )}
            <div className="pr-receipt-main">
              <div className="pr-receipt-left">
                <IconPrinter size={18} className="pr-receipt-icon" aria-hidden />
                <div>
                  <strong className="pr-receipt-label">{p.label}</strong>
                  <span className="pr-receipt-addr">
                    🌐 {p.host} : {p.port} · {p.width_mm}mm
                  </span>
                </div>
              </div>
              <div className="pr-receipt-actions">
                {!p.is_default && (
                  <button
                    className="pr-star-btn"
                    title="Hacer favorita / Set as default"
                    aria-label="Hacer favorita"
                    disabled={settingDefaultId === p.id}
                    onClick={() => handleSetDefault(p.id)}
                  >
                    {settingDefaultId === p.id ? (
                      <IconLoader2 size={15} className="pr-spin" />
                    ) : (
                      <IconStar size={15} />
                    )}
                  </button>
                )}
                <button
                  className="pr-edit-btn"
                  title="Editar / Edit"
                  aria-label="Editar"
                  onClick={() => openEditReceipt(p)}
                >
                  <IconEdit size={15} />
                </button>
                <button
                  className="pr-delete-btn"
                  title="Eliminar / Remove"
                  aria-label="Eliminar"
                  disabled={deletingId === p.id}
                  onClick={() => handleDeleteReceipt(p.id)}
                >
                  {deletingId === p.id ? (
                    <IconLoader2 size={15} className="pr-spin" />
                  ) : (
                    <IconTrash size={15} />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add / edit receipt form */}
        {showReceiptForm && (
          <form className="pr-receipt-form" onSubmit={handleSaveReceipt}>
            <h3 className="pr-form-title">
              {editingReceiptId
                ? "Editar impresora / Edit printer"
                : "Nueva impresora de recibos / New receipt printer"}
            </h3>
            <div className="pr-form-row">
              <label className="pr-label">
                Nombre / Name
                <input
                  className="pr-input"
                  placeholder="Ej. Caja principal / e.g. Main register"
                  value={receiptForm.label}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, label: e.target.value, error: null }))}
                  maxLength={60}
                  required
                />
              </label>
              <label className="pr-label">
                IP
                <input
                  className="pr-input"
                  placeholder="192.168.1.100"
                  value={receiptForm.host}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, host: e.target.value, error: null }))}
                />
              </label>
            </div>
            <div className="pr-form-row">
              <label className="pr-label">
                Puerto / Port
                <input
                  className="pr-input"
                  type="number"
                  min={1}
                  max={65535}
                  value={receiptForm.port}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, port: e.target.value, error: null }))}
                />
              </label>
              <label className="pr-label">
                Ancho / Width
                <select
                  className="pr-input"
                  value={receiptForm.width}
                  onChange={(e) => setReceiptForm((f) => ({ ...f, width: e.target.value as "80" | "58" }))}
                >
                  <option value="80">80mm (estándar / standard)</option>
                  <option value="58">58mm (compacto / compact)</option>
                </select>
              </label>
            </div>
            <label className="pr-checkbox-label">
              <input
                type="checkbox"
                checked={receiptForm.isDefault}
                onChange={(e) => setReceiptForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Usar como favorita / Set as default
            </label>

            {receiptForm.error && (
              <p className="pr-form-error">
                <IconAlertCircle size={13} aria-hidden /> {receiptForm.error}
              </p>
            )}

            <div className="pr-form-actions">
              <button
                type="button"
                className="pr-secondary-btn"
                onClick={() => {
                  setShowReceiptForm(false);
                  setReceiptForm(EMPTY_RECEIPT_FORM);
                  setEditingReceiptId(null);
                }}
                disabled={receiptForm.loading}
              >
                Cancelar / Cancel
              </button>
              <button
                type="submit"
                className="pr-primary-btn"
                disabled={receiptForm.loading}
              >
                {receiptForm.loading ? (
                  <IconLoader2 size={14} className="pr-spin" />
                ) : null}
                {editingReceiptId
                  ? "Actualizar / Update"
                  : "Guardar / Save"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── Bluetooth placeholder ─────────────────────────────────────────── */}
      <section className="pr-section">
        <div className="pr-bluetooth-card">
          <div className="pr-bluetooth-icon">
            <IconBluetooth size={22} aria-hidden />
          </div>
          <div>
            <strong className="pr-bluetooth-title">
              Impresoras Bluetooth / Bluetooth Printers
            </strong>
            <p className="pr-bluetooth-desc">
              Compatibilidad con impresoras Bluetooth próximamente desde la app
              móvil. Bluetooth printer support coming soon via the mobile app.
            </p>
          </div>
          <span className="pr-coming-soon">Próximamente / Coming soon</span>
        </div>
      </section>

      {/* ── Styles ───────────────────────────────────────────────────────────── */}
      <style>{`
        .pr-root {
          padding: 2rem 2.5rem;
          max-width: 860px;
          position: relative;
        }

        /* Toast */
        .pr-toast {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--db-success, #1D9E75);
          color: #fff;
          padding: 0.6rem 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          box-shadow: 0 4px 16px rgba(0,0,0,0.18);
          animation: pr-slide-up 0.2s ease;
        }
        @keyframes pr-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Init error */
        .pr-init-error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 2rem 2.5rem;
          color: var(--db-danger, #ef4444);
          font-size: 0.9rem;
        }

        /* Page header */
        .pr-page-header { margin-bottom: 2rem; }
        .pr-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--db-text);
          margin: 0 0 0.35rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .pr-page-subtitle {
          color: var(--db-text-muted);
          font-size: 0.88rem;
          margin: 0;
          line-height: 1.5;
        }

        /* Sections */
        .pr-section { margin-bottom: 2.5rem; }
        .pr-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .pr-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--db-text);
          margin: 0 0 0.5rem;
        }
        .pr-section-head .pr-section-title { margin-bottom: 0; }
        .pr-section-note {
          font-size: 0.82rem;
          color: var(--db-text-muted);
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Loading */
        .pr-loading {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          color: var(--db-text-muted);
          padding: 0.5rem 0;
        }
        .pr-empty-note {
          font-size: 0.85rem;
          color: var(--db-text-muted);
          line-height: 1.6;
          margin: 0.25rem 0 0.75rem;
        }

        /* ── Commanda cards ─────────────────────────────────────────────── */
        .pr-commanda-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .pr-commanda-card {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 12px;
          padding: 1rem 1.2rem;
        }
        .pr-commanda-configured {
          border-color: color-mix(in srgb, var(--db-accent, #5C7CFA) 40%, var(--db-border));
        }
        .pr-commanda-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }
        .pr-commanda-title-row {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          flex: 1;
          min-width: 0;
        }
        .pr-commanda-emoji {
          font-size: 1.5rem;
          flex-shrink: 0;
          line-height: 1;
        }
        .pr-commanda-name {
          display: block;
          font-size: 0.9rem;
          color: var(--db-text);
        }
        .pr-commanda-desc {
          font-size: 0.78rem;
          color: var(--db-text-muted);
          margin: 0.15rem 0 0;
          line-height: 1.4;
        }
        .pr-commanda-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .pr-commanda-addr {
          margin: 0.5rem 0 0;
          padding-left: 2.25rem;
        }
        .pr-badge-off {
          display: inline-block;
          margin-left: 0.5rem;
          font-size: 0.7rem;
          font-weight: 600;
          background: var(--db-surface-raised, rgba(0,0,0,0.06));
          color: var(--db-text-muted);
          border-radius: 4px;
          padding: 1px 5px;
        }

        /* Toggle button */
        .pr-toggle-btn {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0.2rem;
          border-radius: 4px;
          transition: background 0.12s;
        }
        .pr-toggle-btn:hover { background: var(--db-surface-raised); }
        .pr-toggle-btn:disabled { opacity: 0.5; cursor: default; }

        /* Icon action button */
        .pr-icon-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 6px;
          background: none;
          border: 1px solid var(--db-border);
          cursor: pointer;
          color: var(--db-text-muted);
          transition: background 0.12s, color 0.12s;
        }
        .pr-icon-action:hover { background: var(--db-surface-raised); color: var(--db-text); }

        /* Configure button */
        .pr-configure-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.4rem 0.9rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 500;
          background: var(--db-surface);
          color: var(--db-text);
          border: 1px solid var(--db-border);
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.12s;
          flex-shrink: 0;
        }
        .pr-configure-btn:hover { background: var(--db-surface-raised); }

        /* Inline form */
        .pr-inline-form {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-top: 1px solid var(--db-border);
          padding-top: 1rem;
        }

        /* ── Receipt cards ──────────────────────────────────────────────── */
        .pr-receipt-card {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          margin-bottom: 0.5rem;
          position: relative;
        }
        .pr-receipt-default {
          border-color: #FF7043;
          box-shadow: 0 0 0 1px rgba(255,112,67,0.2);
        }
        .pr-default-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.7rem;
          font-weight: 700;
          color: #FF7043;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .pr-receipt-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .pr-receipt-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          min-width: 0;
        }
        .pr-receipt-icon { color: var(--db-text-muted); flex-shrink: 0; }
        .pr-receipt-label {
          display: block;
          font-size: 0.9rem;
          color: var(--db-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pr-receipt-addr {
          display: block;
          font-size: 0.78rem;
          color: var(--db-text-muted);
          margin-top: 0.1rem;
        }
        .pr-receipt-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .pr-star-btn, .pr-edit-btn, .pr-delete-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 6px;
          background: none;
          border: 1px solid var(--db-border);
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .pr-star-btn { color: #FF7043; }
        .pr-star-btn:hover:not(:disabled) { background: rgba(255,112,67,0.08); }
        .pr-edit-btn { color: var(--db-text-muted); }
        .pr-edit-btn:hover { background: var(--db-surface-raised); color: var(--db-text); }
        .pr-delete-btn { color: #ef4444; }
        .pr-delete-btn:hover:not(:disabled) { background: rgba(239,68,68,0.08); }
        .pr-star-btn:disabled, .pr-delete-btn:disabled { opacity: 0.5; cursor: default; }

        /* Receipt form */
        .pr-receipt-form {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          margin-top: 0.25rem;
        }
        .pr-form-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--db-text);
          margin: 0 0 0.25rem;
        }

        /* Bluetooth placeholder */
        .pr-bluetooth-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.2rem;
          background: var(--db-surface);
          border: 1px dashed var(--db-border);
          border-radius: 12px;
          opacity: 0.65;
        }
        .pr-bluetooth-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--db-surface-raised, rgba(0,0,0,0.05));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--db-text-muted);
          flex-shrink: 0;
        }
        .pr-bluetooth-title {
          display: block;
          font-size: 0.9rem;
          color: var(--db-text);
          margin-bottom: 0.2rem;
        }
        .pr-bluetooth-desc {
          font-size: 0.78rem;
          color: var(--db-text-muted);
          margin: 0;
          line-height: 1.4;
        }
        .pr-coming-soon {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--db-warning, #f59e0b);
          padding: 0.2rem 0.6rem;
          background: rgba(245,158,11,0.1);
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
          margin-left: auto;
        }

        /* Shared form elements */
        .pr-form-row {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0.75rem;
        }
        .pr-label {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--db-text-muted);
        }
        .pr-input {
          border: 1px solid var(--db-border);
          border-radius: 8px;
          padding: 0.5rem 0.7rem;
          font-size: 0.875rem;
          background: var(--db-bg);
          color: var(--db-text);
          outline: none;
          transition: border-color 0.15s;
          width: 100%;
          box-sizing: border-box;
        }
        .pr-input:focus { border-color: var(--db-accent, #5C7CFA); }
        .pr-checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
          color: var(--db-text);
        }
        .pr-form-error {
          font-size: 0.82rem;
          color: #ef4444;
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }
        .pr-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        /* Buttons */
        .pr-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          background: var(--db-accent, #5C7CFA);
          color: #fff;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .pr-primary-btn:disabled { opacity: 0.45; cursor: default; }
        .pr-primary-btn:not(:disabled):hover { opacity: 0.88; }

        .pr-secondary-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          background: var(--db-surface);
          color: var(--db-text);
          border: 1px solid var(--db-border);
          cursor: pointer;
          transition: background 0.15s;
        }
        .pr-secondary-btn:disabled { opacity: 0.45; cursor: default; }
        .pr-secondary-btn:not(:disabled):hover { background: var(--db-surface-raised); }

        .pr-peach-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          background: #FF7043;
          color: #fff;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
          white-space: nowrap;
        }
        .pr-peach-btn:hover { opacity: 0.88; }

        /* Spinner */
        @keyframes pr-spin {
          to { transform: rotate(360deg); }
        }
        .pr-spin { animation: pr-spin 0.8s linear infinite; }

        /* Responsive */
        @media (max-width: 600px) {
          .pr-root { padding: 1.25rem 1rem; }
          .pr-commanda-top { flex-wrap: wrap; }
          .pr-bluetooth-card { flex-wrap: wrap; }
          .pr-section-head { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
