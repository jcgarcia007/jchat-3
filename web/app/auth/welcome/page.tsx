"use client";

/**
 * JChat 3.0 — Bienvenida post-registro.
 * Arregla el bucle: antes el registro empujaba a /dashboard y el gate de plan
 * rebotaba al usuario nuevo (regular) de vuelta a /auth/register?upgrade=1.
 * Aquí se le felicita y se le ofrece mejorar a Business/Pro.
 * Si YA tiene plan de negocio vigente, se salta esta pantalla y va al panel.
 * Bilingüe por `users.language` (elegido en el registro) hasta que exista i18n real.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconCircleCheck,
  IconLoader2,
  IconBuildingStore,
  IconArrowRight,
  IconMessageCircle2,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type Lang = "es" | "en";

const STRINGS: Record<Lang, Record<string, string>> = {
  es: {
    congrats: "¡Felicidades!",
    created: "Has creado tu cuenta en JChat",
    ready:
      "Tu cuenta ya está lista. Puedes empezar a usar JChat desde la app móvil cuando quieras.",
    bizTitle: "¿Tienes un negocio?",
    bizBody:
      "Con Business o Pro administras tu local desde el panel web: menú, mesas, pedidos y pagos.",
    seePlans: "Ver planes Business y Pro",
    later: "Ahora no, gracias",
  },
  en: {
    congrats: "Congratulations!",
    created: "Your JChat account is ready",
    ready: "You can start using JChat from the mobile app whenever you like.",
    bizTitle: "Do you run a business?",
    bizBody:
      "With Business or Pro you manage your venue from the web dashboard: menu, tables, orders and payments.",
    seePlans: "See Business and Pro plans",
    later: "Not now, thanks",
  },
};

export default function WelcomePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("es");
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setChecking(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("display_name, username, language, plan, plan_status, plan_trial_end")
        .eq("id", user.id)
        .single();
      if (cancelled) return;

      if (profile?.language === "en") setLang("en");
      setName(profile?.display_name ?? profile?.username ?? null);

      // Misma regla que el gate del dashboard (D-69): una prueba vencida no cuenta.
      // Aquí es solo una comodidad de navegación, NO una barrera de seguridad —
      // la barrera real vive en web/app/dashboard/layout.tsx.
      const trialExpired =
        profile?.plan_status === "trialing" &&
        profile?.plan_trial_end != null &&
        new Date(profile.plan_trial_end) <= new Date();
      const hasBusinessPlan =
        (profile?.plan === "business" || profile?.plan === "pro") &&
        (profile?.plan_status === "active" || profile?.plan_status === "trialing") &&
        !trialExpired;

      if (hasBusinessPlan) {
        router.replace("/dashboard");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const t = STRINGS[lang];

  if (checking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <IconLoader2 size={28} className="spin" style={{ color: "var(--color-brand)" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 16,
        padding: 28,
        boxShadow: "0 10px 30px var(--bg-overlay)",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 22 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "var(--color-brand)",
            color: "#fff",
          }}
        >
          <IconMessageCircle2 size={17} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>JChat</span>
      </div>

      <IconCircleCheck size={52} stroke={1.4} style={{ color: "var(--color-success)" }} />

      <h1 style={{ fontSize: 21, fontWeight: 700, margin: "12px 0 4px" }}>
        {name ? `${t.congrats} ${name}` : t.congrats}
      </h1>
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
        {t.created}
      </p>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px", lineHeight: 1.6 }}>
        {t.ready}
      </p>

      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          background: "var(--bg-base)",
          padding: 18,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <IconBuildingStore size={18} style={{ color: "var(--color-brand)" }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{t.bizTitle}</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.6 }}>
          {t.bizBody}
        </p>
        <button
          onClick={() => router.push("/pricing")}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-brand)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          {t.seePlans}
          <IconArrowRight size={17} />
        </button>
      </div>

      <button
        onClick={() => router.push("/")}
        style={{
          width: "100%",
          marginTop: 14,
          padding: "9px 16px",
          borderRadius: 10,
          border: "none",
          background: "none",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t.later}
      </button>
    </div>
  );
}
