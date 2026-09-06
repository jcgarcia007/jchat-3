"use client";

/**
 * /dashboard/configuration/devices
 * Owner-only page for managing Stripe Terminal readers.
 * Lists registered smart readers, shows a 4-family device catalog,
 * and walks the owner through a 4-step registration wizard for
 * WiFi/Ethernet readers. M2 / Bluetooth readers are handled
 * automatically by the mobile app — we show a guide only.
 *
 * All Stripe Terminal calls are server-side via the `terminal` EF.
 * No payment logic lives here — registration ≠ taking payments (Phase 3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconAlertCircle,
  IconBluetooth,
  IconCheck,
  IconChevronRight,
  IconDeviceMobile,
  IconDots,
  IconLoader2,
  IconRefresh,
  IconTerminal2,
  IconWifi,
  IconX,
} from "@tabler/icons-react";

import { supabase } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { readFunctionError } from "@/lib/functionError";

// ── device_type → commercial name ────────────────────────────────────────────
const DEVICE_NAMES: Record<string, string> = {
  bbpos_wisepos_e: "BBPOS WisePOS E",
  bbpos_wisepad3: "BBPOS WisePad 3",
  bbpos_chipper2x: "BBPOS Chipper 2X",
  stripe_m2: "Stripe Reader M2",
  stripe_s700: "Stripe Reader S700",
  stripe_s700_devkit: "Stripe S700 Dev Kit",
  stripe_s710: "Stripe Reader S710",
  mobile_phone_reader: "Tap to Pay",
  verifone_m425: "Verifone M425",
  verifone_p630: "Verifone P630",
  verifone_ux700: "Verifone UX700",
  verifone_v660p: "Verifone V660p",
  simulated_wisepos_e: "Simulated WisePOS E",
  simulated_stripe_m2: "Simulated M2",
  simulated_bbpos_chipper2x: "Simulated Chipper 2X",
};

function deviceName(dt: string): string {
  return DEVICE_NAMES[dt] ?? dt;
}

// ── Smart reader models selectable in the wizard ──────────────────────────────
const SMART_MODELS = [
  { id: "bbpos_wisepos_e", name: "BBPOS WisePOS E" },
  { id: "stripe_s700", name: "Stripe Reader S700" },
  { id: "stripe_s710", name: "Stripe Reader S710" },
] as const;

type SmartModelId = (typeof SMART_MODELS)[number]["id"];

// ── Types ─────────────────────────────────────────────────────────────────────
type Reader = {
  id: string;
  label: string;
  device_type: string;
  status: string | null;
  serial_number: string;
  location: string | null;
};

type ModalType = null | "m2" | "tap" | "wizard" | "rename" | "confirm-remove";

// ── Component ─────────────────────────────────────────────────────────────────
export default function DevicesPage() {
  const t = useTranslations("dashboardCommon");

  // Business resolution
  const [bizId, setBizId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [ownerOnly, setOwnerOnly] = useState(false);

  // Reader list
  const [readers, setReaders] = useState<Reader[]>([]);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Context menu for each reader row
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modal
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedReader, setSelectedReader] = useState<Reader | null>(null);

  // Rename
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Remove
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wizard
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardModel, setWizardModel] = useState<SmartModelId | null>(null);
  const [wizardCode, setWizardCode] = useState("");
  const [wizardLabel, setWizardLabel] = useState("");
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardResult, setWizardResult] = useState<{
    label: string;
    deviceType: string;
  } | null>(null);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    resolveActiveBusiness().then((res) => {
      if (!res.ok) {
        setInitError(res.message);
        return;
      }
      setBizId(res.business.id);
    });
  }, []);

  // ── Load readers ────────────────────────────────────────────────────────────
  const loadReaders = useCallback(async () => {
    if (!bizId) return;
    setLoadingReaders(true);
    setLoadError(null);

    const { data, error } = await supabase.functions.invoke("terminal", {
      body: { action: "list_readers", business_id: bizId },
    });

    setLoadingReaders(false);

    if (error) {
      const msg = await readFunctionError(error);
      if (
        msg.toLowerCase().includes("forbidden") ||
        msg.toLowerCase().includes("owner")
      ) {
        setOwnerOnly(true);
      } else {
        setLoadError(t("devicesLoadError"));
      }
      return;
    }

    if (data?.ok) {
      setReaders(data.readers ?? []);
    }
  }, [bizId, t]);

  useEffect(() => {
    if (bizId) loadReaders();
  }, [bizId, loadReaders]);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Close context menu on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener("mousedown", handler, { capture: true });
    return () =>
      document.removeEventListener("mousedown", handler, { capture: true });
  }, [openMenuId]);

  // ── Rename handler ──────────────────────────────────────────────────────────
  const handleRename = useCallback(async () => {
    if (!bizId || !selectedReader || !renameValue.trim()) return;
    setRenameLoading(true);
    setRenameError(null);

    const { data, error } = await supabase.functions.invoke("terminal", {
      body: {
        action: "update_reader",
        business_id: bizId,
        reader_id: selectedReader.id,
        label: renameValue.trim(),
      },
    });

    setRenameLoading(false);

    if (error || !data?.ok) {
      const msg = error
        ? await readFunctionError(error)
        : (data?.error ?? "Error");
      setRenameError(msg);
      return;
    }

    setReaders((prev) =>
      prev.map((r) =>
        r.id === selectedReader.id ? { ...r, label: renameValue.trim() } : r
      )
    );
    setModal(null);
    showToast(t("devicesRenameSuccess"));
  }, [bizId, selectedReader, renameValue, t, showToast]);

  // ── Remove handler ──────────────────────────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!bizId || !selectedReader) return;
    setRemoveLoading(true);
    setRemoveError(null);

    const { data, error } = await supabase.functions.invoke("terminal", {
      body: {
        action: "remove_reader",
        business_id: bizId,
        reader_id: selectedReader.id,
      },
    });

    setRemoveLoading(false);

    if (error || !data?.ok) {
      const msg = error
        ? await readFunctionError(error)
        : (data?.error ?? "Error");
      setRemoveError(msg);
      return;
    }

    setReaders((prev) => prev.filter((r) => r.id !== selectedReader.id));
    setModal(null);
    showToast(t("devicesRemoveSuccess"));
  }, [bizId, selectedReader, t, showToast]);

  // ── Register reader (wizard step 3) ─────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    if (!bizId || !wizardModel || !wizardCode.trim()) return;
    setWizardLoading(true);
    setWizardError(null);

    const { data, error } = await supabase.functions.invoke("terminal", {
      body: {
        action: "register_reader",
        business_id: bizId,
        registration_code: wizardCode.trim().toLowerCase(),
        label: wizardLabel.trim() || "Lector",
      },
    });

    setWizardLoading(false);

    if (error) {
      const msg = await readFunctionError(error);
      setWizardError(msg || t("devicesRegisterFailed"));
      return;
    }

    if (!data?.ok) {
      const detail: string = data?.detail ?? "";
      const base = t("devicesRegisterFailed");
      setWizardError(detail ? `${base} (${detail})` : base);
      return;
    }

    // Optimistically add to the list
    if (data.reader) {
      setReaders((prev) => {
        const exists = prev.some((r) => r.id === data.reader.id);
        return exists ? prev : [...prev, data.reader as Reader];
      });
    }

    setWizardResult({
      label: (data.reader?.label ?? wizardLabel.trim()) || "Lector",
      deviceType: data.reader?.device_type ?? wizardModel,
    });
    setWizardStep(4);
  }, [bizId, wizardModel, wizardCode, wizardLabel, t]);

  // ── Wizard helpers ──────────────────────────────────────────────────────────
  const resetWizard = () => {
    setWizardStep(1);
    setWizardModel(null);
    setWizardCode("");
    setWizardLabel("");
    setWizardError(null);
    setWizardResult(null);
    setWizardLoading(false);
  };

  const openWizard = () => {
    resetWizard();
    setModal("wizard");
  };

  const closeModal = () => {
    setModal(null);
    setRenameError(null);
    setRemoveError(null);
  };

  const prevWizardStep = () => {
    if (wizardStep === 1) {
      closeModal();
    } else {
      setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    }
  };

  // ── Early returns ──────────────────────────────────────────────────────────
  if (initError) {
    return (
      <div className="dv-init-error">
        <IconAlertCircle size={18} />
        <span>{initError === "No active business found." ? t("devicesNoBizError") : initError}</span>
      </div>
    );
  }

  if (ownerOnly) {
    return (
      <div className="dv-init-error">
        <IconAlertCircle size={18} />
        <span>{t("devicesOwnerOnly")}</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dv-root">

      {/* Toast */}
      {toast && (
        <div className="dv-toast" role="status" aria-live="polite">
          <IconCheck size={15} />
          <span>{toast}</span>
        </div>
      )}

      {/* Page header */}
      <div className="dv-page-header">
        <h1 className="dv-page-title">{t("devicesPageTitle")}</h1>
        <p className="dv-page-subtitle">{t("devicesPageSubtitle")}</p>
      </div>

      {/* ── My Readers ─────────────────────────────────────────────────────── */}
      <section className="dv-section">
        <div className="dv-section-head">
          <h2 className="dv-section-title">{t("devicesMyReadersTitle")}</h2>
          <button
            className="dv-icon-btn"
            onClick={loadReaders}
            disabled={loadingReaders}
            title={t("devicesRetryBtn")}
            aria-label={t("devicesRetryBtn")}
          >
            <IconRefresh size={16} />
          </button>
        </div>

        {loadingReaders && (
          <div className="dv-loading-row">
            <IconLoader2 size={18} className="dv-spin" />
            <span>{t("devicesLoadingText")}</span>
          </div>
        )}

        {!loadingReaders && loadError && (
          <div className="dv-error-row">
            <IconAlertCircle size={16} />
            <span>{loadError}</span>
            <button className="dv-link-btn" onClick={loadReaders}>
              {t("devicesRetryBtn")}
            </button>
          </div>
        )}

        {!loadingReaders && !loadError && readers.length === 0 && (
          <div className="dv-empty-state">
            <IconTerminal2 size={36} className="dv-empty-icon" />
            <p>{t("devicesMyReadersEmpty")}</p>
          </div>
        )}

        {!loadingReaders && !loadError && readers.length > 0 && (
          <div className="dv-reader-list">
            {readers.map((r) => (
              <div key={r.id} className="dv-reader-card">
                <div className="dv-reader-left">
                  <span className="dv-reader-label">{r.label || deviceName(r.device_type)}</span>
                  <span className="dv-reader-meta">
                    {deviceName(r.device_type)}
                    {r.serial_number ? ` · ${r.serial_number}` : ""}
                  </span>
                  <span className="dv-reader-note">{t("devicesSmartNote")}</span>
                </div>
                <div className="dv-reader-right">
                  <span
                    className={`dv-status-badge ${r.status === "online" ? "online" : "offline"}`}
                  >
                    <span className="dv-status-dot" />
                    {r.status === "online"
                      ? t("devicesStatusOnline")
                      : t("devicesStatusOffline")}
                  </span>

                  <div className="dv-menu-wrap">
                    <button
                      className="dv-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === r.id ? null : r.id);
                      }}
                      aria-label="Actions"
                      aria-haspopup="true"
                      aria-expanded={openMenuId === r.id}
                    >
                      <IconDots size={18} />
                    </button>

                    {openMenuId === r.id && (
                      <div className="dv-dropdown" role="menu">
                        <button
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReader(r);
                            setRenameValue(r.label ?? "");
                            setRenameError(null);
                            setOpenMenuId(null);
                            setModal("rename");
                          }}
                        >
                          {t("devicesRenameAction")}
                        </button>
                        <button
                          role="menuitem"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReader(r);
                            setRemoveError(null);
                            setOpenMenuId(null);
                            setModal("confirm-remove");
                          }}
                        >
                          {t("devicesRemoveAction")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="dv-bluetooth-note">
          <IconBluetooth size={13} aria-hidden />
          {t("devicesBluetoothNote")}
        </p>
      </section>

      {/* ── Device catalog ─────────────────────────────────────────────────── */}
      <section className="dv-section">
        <h2 className="dv-section-title">{t("devicesCatalogTitle")}</h2>
        <div className="dv-catalog-grid">

          {/* Stripe Reader M2 */}
          <div className="dv-catalog-card">
            <div className="dv-catalog-icon">
              <IconBluetooth size={26} aria-hidden />
            </div>
            <div className="dv-catalog-info">
              <strong>{t("devicesCatalogM2Name")}</strong>
              <p>{t("devicesCatalogM2Desc")}</p>
            </div>
            <button className="dv-secondary-btn" onClick={() => setModal("m2")}>
              {t("devicesGuideBtn")}
            </button>
          </div>

          {/* Smart readers — primary card */}
          <div className="dv-catalog-card dv-catalog-featured">
            <div className="dv-catalog-icon">
              <IconTerminal2 size={26} aria-hidden />
            </div>
            <div className="dv-catalog-info">
              <strong>{t("devicesCatalogSmartName")}</strong>
              <span className="dv-models-tag">{t("devicesCatalogSmartModels")}</span>
              <p>{t("devicesCatalogSmartDesc")}</p>
            </div>
            <button className="dv-primary-btn" onClick={openWizard}>
              {t("devicesAddBtn")}
            </button>
          </div>

          {/* Tap to Pay */}
          <div className="dv-catalog-card">
            <div className="dv-catalog-icon">
              <IconDeviceMobile size={26} aria-hidden />
            </div>
            <div className="dv-catalog-info">
              <strong>{t("devicesCatalogTapName")}</strong>
              <p>{t("devicesCatalogTapDesc")}</p>
            </div>
            <button className="dv-secondary-btn" onClick={() => setModal("tap")}>
              {t("devicesRequirementsBtn")}
            </button>
          </div>

          {/* Verifone — coming soon */}
          <div className="dv-catalog-card dv-catalog-disabled">
            <div className="dv-catalog-icon">
              <IconTerminal2 size={26} aria-hidden />
            </div>
            <div className="dv-catalog-info">
              <strong>{t("devicesCatalogVerifoneName")}</strong>
              <span className="dv-models-tag">{t("devicesCatalogVerifoneModels")}</span>
              <p>{t("devicesCatalogVerifoneDesc")}</p>
            </div>
            <span className="dv-coming-soon">{t("devicesComingSoon")}</span>
          </div>
        </div>
      </section>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal && (
        <div
          className="dv-backdrop"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div className="dv-modal" onClick={(e) => e.stopPropagation()}>

            {/* ── M2 guide ───────────────────────────────────────────────── */}
            {modal === "m2" && (
              <>
                <div className="dv-modal-header">
                  <h3>{t("devicesM2GuideTitle")}</h3>
                  <button className="dv-icon-btn" onClick={closeModal} aria-label="Close">
                    <IconX size={18} />
                  </button>
                </div>
                <div className="dv-modal-body">
                  <p className="dv-guide-intro">
                    El M2 no se registra aquí — se empareja automáticamente, por
                    Bluetooth, desde la app del mesero al momento de cobrar.
                  </p>
                  <ol className="dv-guide-steps">
                    <li>Enciende el M2 (las luces se mueven de lado a lado).</li>
                    <li>Asegúrate de tener Bluetooth activo en el teléfono del mesero.</li>
                    <li>
                      Al tocar <strong>Cobrar</strong> en la app, el lector aparece y
                      se conecta solo.
                    </li>
                    <li>
                      La primera vez puede actualizar su software automáticamente
                      (2–5 min). Es normal.
                    </li>
                  </ol>
                </div>
                <div className="dv-modal-footer">
                  <button className="dv-primary-btn" onClick={closeModal}>
                    {t("devicesCloseBtn")}
                  </button>
                </div>
              </>
            )}

            {/* ── Tap to Pay guide ───────────────────────────────────────── */}
            {modal === "tap" && (
              <>
                <div className="dv-modal-header">
                  <h3>{t("devicesTapGuideTitle")}</h3>
                  <button className="dv-icon-btn" onClick={closeModal} aria-label="Close">
                    <IconX size={18} />
                  </button>
                </div>
                <div className="dv-modal-body">
                  <p className="dv-guide-intro">
                    Tap to Pay convierte tu iPhone o Android en un lector de pagos
                    sin hardware adicional. La activación se hace desde la app móvil
                    — aún no disponible (Fase 3).
                  </p>
                  <div className="dv-req-grid">
                    <div className="dv-req-item">
                      <strong>iPhone</strong>
                      <ul>
                        <li>iOS 16 o superior</li>
                        <li>Región con soporte NFC</li>
                        <li>Entitlement de Apple (gestionado por JChat)</li>
                      </ul>
                    </div>
                    <div className="dv-req-item">
                      <strong>Android</strong>
                      <ul>
                        <li>Dispositivo con NFC</li>
                        <li>Google Play Services actualizado</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="dv-modal-footer">
                  <button className="dv-primary-btn" onClick={closeModal}>
                    {t("devicesCloseBtn")}
                  </button>
                </div>
              </>
            )}

            {/* ── Rename ─────────────────────────────────────────────────── */}
            {modal === "rename" && (
              <>
                <div className="dv-modal-header">
                  <h3>{t("devicesRenameTitle")}</h3>
                  <button className="dv-icon-btn" onClick={closeModal} aria-label="Close">
                    <IconX size={18} />
                  </button>
                </div>
                <div className="dv-modal-body">
                  <label className="dv-field-label">{t("devicesWizardLabelLabel")}</label>
                  <input
                    className="dv-text-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder={t("devicesWizardLabelPlaceholder")}
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) =>
                      e.key === "Enter" && !renameLoading && handleRename()
                    }
                  />
                  {renameError && (
                    <p className="dv-field-error">
                      <IconAlertCircle size={13} />
                      {renameError}
                    </p>
                  )}
                </div>
                <div className="dv-modal-footer">
                  <button
                    className="dv-secondary-btn"
                    onClick={closeModal}
                    disabled={renameLoading}
                  >
                    {t("devicesRenameCancelBtn")}
                  </button>
                  <button
                    className="dv-primary-btn"
                    onClick={handleRename}
                    disabled={renameLoading || !renameValue.trim()}
                  >
                    {renameLoading ? (
                      <IconLoader2 size={15} className="dv-spin" />
                    ) : (
                      t("devicesRenameSaveBtn")
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Remove confirmation ─────────────────────────────────────── */}
            {modal === "confirm-remove" && (
              <>
                <div className="dv-modal-header">
                  <h3>{t("devicesRemoveConfirmTitle")}</h3>
                  <button className="dv-icon-btn" onClick={closeModal} aria-label="Close">
                    <IconX size={18} />
                  </button>
                </div>
                <div className="dv-modal-body">
                  <p>{t("devicesRemoveConfirmText")}</p>
                  {selectedReader && (
                    <p className="dv-confirm-target">
                      {selectedReader.label ||
                        deviceName(selectedReader.device_type)}
                    </p>
                  )}
                  {removeError && (
                    <p className="dv-field-error">
                      <IconAlertCircle size={13} />
                      {removeError}
                    </p>
                  )}
                </div>
                <div className="dv-modal-footer">
                  <button
                    className="dv-secondary-btn"
                    onClick={closeModal}
                    disabled={removeLoading}
                  >
                    {t("devicesRenameCancelBtn")}
                  </button>
                  <button
                    className="dv-danger-btn"
                    onClick={handleRemove}
                    disabled={removeLoading}
                  >
                    {removeLoading ? (
                      <IconLoader2 size={15} className="dv-spin" />
                    ) : (
                      t("devicesRemoveConfirmBtn")
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Wizard ─────────────────────────────────────────────────── */}
            {modal === "wizard" && (
              <>
                <div className="dv-modal-header">
                  <h3>{t("devicesWizardTitle")}</h3>
                  <button className="dv-icon-btn" onClick={closeModal} aria-label="Close">
                    <IconX size={18} />
                  </button>
                </div>

                {/* Progress dots */}
                <div className="dv-wizard-progress" aria-label="Progress">
                  {([1, 2, 3, 4] as const).map((s) => (
                    <div
                      key={s}
                      className={`dv-progress-dot ${
                        s < wizardStep ? "done" : s === wizardStep ? "active" : ""
                      }`}
                    >
                      {s < wizardStep ? <IconCheck size={11} /> : s}
                    </div>
                  ))}
                </div>

                {/* Step 1 — Choose model */}
                {wizardStep === 1 && (
                  <div className="dv-modal-body">
                    <p className="dv-step-label">{t("devicesWizardStep1")}</p>
                    <div className="dv-model-list">
                      {SMART_MODELS.map((m) => (
                        <button
                          key={m.id}
                          className={`dv-model-option ${
                            wizardModel === m.id ? "selected" : ""
                          }`}
                          onClick={() => setWizardModel(m.id)}
                        >
                          <IconTerminal2 size={18} aria-hidden />
                          <span>{m.name}</span>
                          {wizardModel === m.id && (
                            <IconCheck size={15} className="dv-check-mark" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2 — Connect to WiFi (model-specific instructions) */}
                {wizardStep === 2 && (
                  <div className="dv-modal-body">
                    <p className="dv-step-label">{t("devicesWizardStep2")}</p>
                    <div className="dv-wifi-guide">
                      <IconWifi
                        size={28}
                        style={{ color: "var(--db-accent)", marginBottom: "0.75rem" }}
                        aria-hidden
                      />

                      {wizardModel === "bbpos_wisepos_e" && (
                        <ol className="dv-guide-steps">
                          <li>Enciende el WisePOS E.</li>
                          <li>
                            En la pantalla del lector, ve a{" "}
                            <strong>Settings → WiFi</strong>.
                          </li>
                          <li>Conéctalo a la misma red WiFi de tu negocio.</li>
                          <li>
                            Cuando aparezca &ldquo;Connected&rdquo;, el lector mostrará el
                            código de emparejamiento en pantalla.
                          </li>
                        </ol>
                      )}

                      {wizardModel === "stripe_s700" && (
                        <ol className="dv-guide-steps">
                          <li>Enciende el S700.</li>
                          <li>
                            En la pantalla, ve a{" "}
                            <strong>Settings → Network → WiFi</strong>.
                          </li>
                          <li>Selecciona tu red y conéctate.</li>
                          <li>
                            Al conectarse, el lector muestra el código de 3 palabras
                            en pantalla.
                          </li>
                        </ol>
                      )}

                      {wizardModel === "stripe_s710" && (
                        <ol className="dv-guide-steps">
                          <li>Enciende el S710.</li>
                          <li>
                            En la pantalla, ve a{" "}
                            <strong>Settings → Network → WiFi</strong>.
                          </li>
                          <li>
                            Selecciona tu red y conéctate (la contraseña del panel de
                            ajustes es <code className="dv-code">07139</code>).
                          </li>
                          <li>
                            Al conectarse, el lector muestra el código de 3 palabras
                            en pantalla.
                          </li>
                        </ol>
                      )}

                      <p className="dv-info-note">{t("devicesWizardNetworkNote")}</p>
                    </div>
                  </div>
                )}

                {/* Step 3 — Pairing code + label */}
                {wizardStep === 3 && (
                  <div className="dv-modal-body">
                    <p className="dv-step-label">{t("devicesWizardStep3")}</p>
                    <p className="dv-step-hint">{t("devicesWizardCodeHint")}</p>

                    <label className="dv-field-label">
                      {t("devicesWizardCodeLabel")}
                    </label>
                    <input
                      className="dv-text-input dv-mono"
                      value={wizardCode}
                      onChange={(e) => {
                        setWizardCode(e.target.value);
                        setWizardError(null);
                      }}
                      placeholder={t("devicesWizardCodePlaceholder")}
                      autoFocus
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                    />

                    <label className="dv-field-label" style={{ marginTop: "1.1rem" }}>
                      {t("devicesWizardLabelLabel")}
                    </label>
                    <input
                      className="dv-text-input"
                      value={wizardLabel}
                      onChange={(e) => setWizardLabel(e.target.value)}
                      placeholder={t("devicesWizardLabelPlaceholder")}
                      maxLength={60}
                    />

                    {wizardError && (
                      <div className="dv-wizard-error">
                        <p className="dv-field-error">
                          <IconAlertCircle size={13} />
                          {wizardError}
                        </p>
                        <p className="dv-expired-hint">
                          {t("devicesWizardCodeExpired")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4 — Success */}
                {wizardStep === 4 && (
                  <div className="dv-modal-body dv-success-step">
                    <div className="dv-success-icon" aria-hidden>
                      <IconCheck size={32} />
                    </div>
                    <h4 className="dv-success-title">{t("devicesWizardSuccessTitle")}</h4>
                    {wizardResult && (
                      <p className="dv-success-detail">
                        <strong>
                          {deviceName(wizardResult.deviceType)}
                        </strong>{" "}
                        · {wizardResult.label}
                      </p>
                    )}
                    <p className="dv-success-note">{t("devicesWizardSuccessNote")}</p>
                  </div>
                )}

                {/* Wizard footer */}
                <div className="dv-modal-footer">
                  {wizardStep < 4 && (
                    <button
                      className="dv-secondary-btn"
                      onClick={prevWizardStep}
                      disabled={wizardLoading}
                    >
                      {wizardStep === 1
                        ? t("devicesRenameCancelBtn")
                        : t("devicesWizardBackBtn")}
                    </button>
                  )}

                  {wizardStep === 1 && (
                    <button
                      className="dv-primary-btn"
                      disabled={!wizardModel}
                      onClick={() => setWizardStep(2)}
                    >
                      {t("devicesWizardNextBtn")}
                      <IconChevronRight size={14} aria-hidden />
                    </button>
                  )}

                  {wizardStep === 2 && (
                    <button
                      className="dv-primary-btn"
                      onClick={() => setWizardStep(3)}
                    >
                      {t("devicesWizardNextBtn")}
                      <IconChevronRight size={14} aria-hidden />
                    </button>
                  )}

                  {wizardStep === 3 && (
                    <button
                      className="dv-primary-btn"
                      disabled={wizardLoading || !wizardCode.trim()}
                      onClick={handleRegister}
                    >
                      {wizardLoading ? (
                        <IconLoader2 size={15} className="dv-spin" />
                      ) : (
                        t("devicesWizardRegisterBtn")
                      )}
                    </button>
                  )}

                  {wizardStep === 4 && (
                    <button className="dv-primary-btn" onClick={closeModal}>
                      {t("devicesCloseBtn")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Styles ─────────────────────────────────────────────────────────── */}
      <style>{`
        .dv-root {
          padding: 2rem 2.5rem;
          max-width: 860px;
          position: relative;
        }

        /* Toast */
        .dv-toast {
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
          animation: dv-slide-up 0.2s ease;
        }

        @keyframes dv-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Page header */
        .dv-page-header { margin-bottom: 2rem; }
        .dv-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--db-text);
          margin: 0 0 0.35rem;
        }
        .dv-page-subtitle {
          color: var(--db-text-muted);
          font-size: 0.9rem;
          margin: 0;
        }

        /* Sections */
        .dv-section {
          margin-bottom: 2.5rem;
        }
        .dv-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .dv-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--db-text);
          margin: 0 0 1rem;
        }
        .dv-section-head .dv-section-title { margin-bottom: 0; }

        /* Reader list */
        .dv-reader-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .dv-reader-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1rem;
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 10px;
          gap: 1rem;
        }
        .dv-reader-left {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          flex: 1;
          min-width: 0;
        }
        .dv-reader-label {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--db-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dv-reader-meta {
          font-size: 0.78rem;
          color: var(--db-text-muted);
        }
        .dv-reader-note {
          font-size: 0.72rem;
          color: var(--db-accent, #5C7CFA);
          opacity: 0.8;
        }
        .dv-reader-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        /* Status badge */
        .dv-status-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          font-weight: 500;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
        }
        .dv-status-badge.online {
          background: rgba(29,158,117,0.12);
          color: var(--db-success, #1D9E75);
        }
        .dv-status-badge.offline {
          background: var(--db-surface-raised, rgba(0,0,0,0.06));
          color: var(--db-text-muted);
        }
        .dv-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }

        /* Context menu */
        .dv-menu-wrap { position: relative; }
        .dv-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          min-width: 130px;
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          overflow: hidden;
          z-index: 200;
        }
        .dv-dropdown button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 0.55rem 0.9rem;
          font-size: 0.85rem;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--db-text);
          transition: background 0.12s;
        }
        .dv-dropdown button:hover {
          background: var(--db-surface-raised);
        }
        .dv-dropdown button.danger {
          color: var(--db-danger, #ef4444);
        }

        /* Bluetooth note */
        .dv-bluetooth-note {
          font-size: 0.78rem;
          color: var(--db-text-muted);
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          margin: 0.5rem 0 0;
          line-height: 1.5;
        }

        /* Empty / loading / error */
        .dv-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2.5rem 1rem;
          background: var(--db-surface);
          border: 1px dashed var(--db-border);
          border-radius: 12px;
          color: var(--db-text-muted);
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .dv-empty-icon { opacity: 0.3; }
        .dv-loading-row, .dv-error-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: var(--db-text-muted);
          padding: 0.75rem 0;
        }
        .dv-error-row { color: var(--db-danger, #ef4444); }

        /* Device catalog */
        .dv-catalog-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1rem;
        }
        .dv-catalog-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.2rem;
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 12px;
        }
        .dv-catalog-featured {
          border-color: var(--db-accent, #5C7CFA);
          background: color-mix(in srgb, var(--db-accent, #5C7CFA) 6%, var(--db-surface));
        }
        .dv-catalog-disabled { opacity: 0.55; }
        .dv-catalog-icon {
          width: 44px;
          height: 44px;
          background: var(--db-surface-raised, rgba(0,0,0,0.05));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--db-accent, #5C7CFA);
        }
        .dv-catalog-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
        .dv-catalog-info strong { font-size: 0.9rem; color: var(--db-text); }
        .dv-catalog-info p { font-size: 0.8rem; color: var(--db-text-muted); margin: 0; line-height: 1.45; }
        .dv-models-tag {
          font-size: 0.72rem;
          color: var(--db-accent, #5C7CFA);
          font-weight: 500;
        }
        .dv-coming-soon {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--db-warning, #f59e0b);
          padding: 0.2rem 0.6rem;
          background: rgba(245,158,11,0.1);
          border-radius: 999px;
          align-self: flex-start;
        }

        /* Init error */
        .dv-init-error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 2rem 2.5rem;
          color: var(--db-danger, #ef4444);
          font-size: 0.9rem;
        }

        /* Buttons */
        .dv-primary-btn {
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
        .dv-primary-btn:disabled { opacity: 0.45; cursor: default; }
        .dv-primary-btn:not(:disabled):hover { opacity: 0.88; }

        .dv-secondary-btn {
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
        .dv-secondary-btn:disabled { opacity: 0.45; cursor: default; }
        .dv-secondary-btn:not(:disabled):hover { background: var(--db-surface-raised); }

        .dv-danger-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          background: var(--db-danger, #ef4444);
          color: #fff;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .dv-danger-btn:disabled { opacity: 0.45; cursor: default; }
        .dv-danger-btn:not(:disabled):hover { opacity: 0.88; }

        .dv-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--db-text-muted);
          transition: background 0.12s, color 0.12s;
        }
        .dv-icon-btn:hover { background: var(--db-surface-raised); color: var(--db-text); }
        .dv-icon-btn:disabled { opacity: 0.4; cursor: default; }

        .dv-link-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--db-accent, #5C7CFA);
          font-size: 0.85rem;
          font-weight: 500;
          padding: 0;
          text-decoration: underline;
        }

        /* Modal */
        .dv-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .dv-modal {
          background: var(--db-surface);
          border: 1px solid var(--db-border);
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.22);
        }
        .dv-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.1rem 1.3rem 0.75rem;
          border-bottom: 1px solid var(--db-border);
        }
        .dv-modal-header h3 {
          font-size: 1rem;
          font-weight: 700;
          color: var(--db-text);
          margin: 0;
        }
        .dv-modal-body {
          padding: 1.2rem 1.3rem;
          overflow-y: auto;
          flex: 1;
        }
        .dv-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.6rem;
          padding: 0.9rem 1.3rem;
          border-top: 1px solid var(--db-border);
        }

        /* Form fields */
        .dv-field-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--db-text-muted);
          margin-bottom: 0.35rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .dv-text-input {
          width: 100%;
          padding: 0.55rem 0.8rem;
          border: 1px solid var(--db-border);
          border-radius: 8px;
          background: var(--db-surface-raised, rgba(0,0,0,0.04));
          color: var(--db-text);
          font-size: 0.9rem;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }
        .dv-text-input:focus { border-color: var(--db-accent, #5C7CFA); }
        .dv-mono { font-family: ui-monospace, "SFMono-Regular", monospace; letter-spacing: 0.02em; }

        .dv-field-error {
          display: flex;
          align-items: flex-start;
          gap: 0.35rem;
          color: var(--db-danger, #ef4444);
          font-size: 0.8rem;
          margin-top: 0.5rem;
        }

        /* Confirm target */
        .dv-confirm-target {
          margin-top: 0.75rem;
          font-weight: 700;
          color: var(--db-text);
        }

        /* Wizard progress */
        .dv-wizard-progress {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.8rem 1.3rem;
          border-bottom: 1px solid var(--db-border);
        }
        .dv-progress-dot {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 2px solid var(--db-border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--db-text-muted);
          transition: all 0.2s;
        }
        .dv-progress-dot.active {
          border-color: var(--db-accent, #5C7CFA);
          color: var(--db-accent, #5C7CFA);
          background: color-mix(in srgb, var(--db-accent, #5C7CFA) 10%, transparent);
        }
        .dv-progress-dot.done {
          background: var(--db-accent, #5C7CFA);
          border-color: var(--db-accent, #5C7CFA);
          color: #fff;
        }

        /* Wizard steps */
        .dv-step-label {
          font-weight: 700;
          color: var(--db-text);
          margin: 0 0 0.75rem;
          font-size: 0.95rem;
        }
        .dv-step-hint {
          font-size: 0.85rem;
          color: var(--db-text-muted);
          margin: 0 0 1rem;
          line-height: 1.5;
        }

        /* Model picker */
        .dv-model-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dv-model-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.8rem 1rem;
          border: 1.5px solid var(--db-border);
          border-radius: 10px;
          background: var(--db-surface);
          cursor: pointer;
          color: var(--db-text);
          font-size: 0.9rem;
          font-weight: 500;
          text-align: left;
          width: 100%;
          transition: border-color 0.15s, background 0.15s;
        }
        .dv-model-option:hover { background: var(--db-surface-raised); }
        .dv-model-option.selected {
          border-color: var(--db-accent, #5C7CFA);
          background: color-mix(in srgb, var(--db-accent, #5C7CFA) 8%, var(--db-surface));
        }
        .dv-check-mark {
          margin-left: auto;
          color: var(--db-accent, #5C7CFA);
        }

        /* WiFi guide */
        .dv-wifi-guide {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
        .dv-guide-steps {
          padding-left: 1.25rem;
          margin: 0 0 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .dv-guide-steps li {
          font-size: 0.875rem;
          color: var(--db-text);
          line-height: 1.5;
        }
        .dv-guide-intro {
          font-size: 0.875rem;
          color: var(--db-text);
          line-height: 1.6;
          margin-bottom: 1rem;
        }
        .dv-info-note {
          font-size: 0.8rem;
          color: var(--db-text-muted);
          margin: 0.5rem 0 0;
          line-height: 1.5;
        }
        .dv-code {
          font-family: ui-monospace, monospace;
          background: var(--db-surface-raised, rgba(0,0,0,0.06));
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
          font-size: 0.85em;
        }

        /* Wizard error */
        .dv-wizard-error { margin-top: 0.75rem; }
        .dv-expired-hint {
          font-size: 0.78rem;
          color: var(--db-text-muted);
          margin: 0.3rem 0 0;
          padding-left: 1.5rem;
          line-height: 1.5;
        }

        /* Success step */
        .dv-success-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem 1.5rem;
        }
        .dv-success-icon {
          width: 56px;
          height: 56px;
          background: var(--db-success, #1D9E75);
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
        }
        .dv-success-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--db-text);
          margin: 0 0 0.5rem;
        }
        .dv-success-detail {
          font-size: 0.875rem;
          color: var(--db-text-muted);
          margin: 0 0 1rem;
        }
        .dv-success-note {
          font-size: 0.8rem;
          color: var(--db-text-muted);
          background: var(--db-surface-raised, rgba(0,0,0,0.04));
          padding: 0.65rem 1rem;
          border-radius: 8px;
          line-height: 1.5;
          margin: 0;
          border: 1px solid var(--db-border);
        }

        /* Tap to Pay requirements */
        .dv-req-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-top: 0.75rem;
        }
        .dv-req-item {
          padding: 0.85rem;
          background: var(--db-surface-raised, rgba(0,0,0,0.04));
          border-radius: 10px;
          border: 1px solid var(--db-border);
        }
        .dv-req-item strong {
          display: block;
          font-size: 0.875rem;
          color: var(--db-text);
          margin-bottom: 0.5rem;
        }
        .dv-req-item ul {
          padding-left: 1.1rem;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .dv-req-item li {
          font-size: 0.8rem;
          color: var(--db-text-muted);
          line-height: 1.4;
        }

        /* Spinner */
        @keyframes dv-spin {
          to { transform: rotate(360deg); }
        }
        .dv-spin {
          animation: dv-spin 0.8s linear infinite;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .dv-root { padding: 1.25rem 1rem; }
          .dv-catalog-grid { grid-template-columns: 1fr; }
          .dv-req-grid { grid-template-columns: 1fr; }
          .dv-reader-card { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
