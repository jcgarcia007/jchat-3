"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getUsageAndLimits, type UsageAndLimits } from "@/lib/planLimits";
import { SalesCalendar } from "@/components/dashboard/SalesCalendar";

export default function OverviewPage() {
  const t = useTranslations("dashboardCommon");
  const [usage, setUsage] = useState<UsageAndLimits | null>(null);

  useEffect(() => {
    let active = true;
    void getUsageAndLimits().then((res) => {
      if (active) setUsage(res);
    });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", marginBottom: "8px" }}>
        {t("navOverview")}
      </h1>
      {usage && (
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", marginBottom: "24px" }}>
          {t("usageSummary", {
            bizUsed: usage.businesses.used,
            bizLimit: usage.businesses.limit,
            evUsed: usage.events.used,
            evLimit: usage.events.limit,
            plan: usage.plan,
          })}
        </p>
      )}
      <SalesCalendar />
    </div>
  );
}
