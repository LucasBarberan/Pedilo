// components/info-banner.tsx
"use client";

import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";

const levelClasses: Record<string, {wrap: string; text: string; border: string; bg: string}> = {
  info:    { wrap: "border-sky-200",    text: "text-sky-800",    border: "border", bg: "bg-sky-50" },
  warning: { wrap: "border-amber-200",  text: "text-amber-900",  border: "border", bg: "bg-amber-50" },
  success: { wrap: "border-emerald-200",text: "text-emerald-800",border: "border", bg: "bg-emerald-50" },
};

export default function InfoBanner() {
  const { config } = useOnlineConfig();

  if (!config.infoBannerEnabled) return null;

  const msg = config.infoBannerMsg?.trim();
  if (!msg) return null;

  const lc = levelClasses[config.infoBannerLevel] ?? levelClasses.info;

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className={`mt-4 rounded-2xl ${lc.border} ${lc.wrap} ${lc.bg} px-4 py-3 text-sm ${lc.text}`}>
        {msg}
      </div>
    </div>
  );
}
