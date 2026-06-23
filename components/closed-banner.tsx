// components/closed-banner.tsx
"use client";

import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";

export default function ClosedBanner() {
  const { data: status, error } = useBusinessStatusSmart();
  const { config } = useOnlineConfig();
  if (error || !status) return null;

  const tz = status.timezone || "America/Argentina/Cordoba";
  const now = new Date(status.now);
  const web = status.web;
  const pos = status.pos;

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("es-AR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const fmtWeekday = (d: Date) =>
    d.toLocaleDateString("es-AR", { timeZone: tz, weekday: "long" });
  const isSameLocalDate = (a: Date, b: Date) =>
    a.toLocaleDateString("es-AR", { timeZone: tz }) ===
    b.toLocaleDateString("es-AR", { timeZone: tz });

  const nextAt = web.nextChange?.at ? new Date(web.nextChange.at) : null;

  // 👉 Caso “solo local”: POS abierto y WEB cerrado
  if (pos.open && !web.open) {


    // MISMO ESTILO (ROJO) QUE LOS DEMÁS MENSAJES
    return (
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {config.pickupOnlyMsg || "El local está abierto, pero sólo tomamos pedidos en el local por ahora."}
        </div>
      </div>
    );
  }

  // Si WEB está abierto, no mostramos nada
  if (web.open) return null;

  // 🔴 Caso “cerrado” (ningún canal abierto o WEB cerrado y POS también)
  let extra = "";
  if (web.reason === "CLOSED_DAY" || web.reason === "NO_RANGE") {
    extra =
      nextAt && web.nextChange?.willOpen
        ? ` Volvemos el ${fmtWeekday(nextAt)} a las ${fmtTime(nextAt)}.`
        : "";
  } else if (web.reason === "EXCEPTION") {
    extra =
      nextAt && web.nextChange?.willOpen
        ? isSameLocalDate(now, nextAt)
          ? ` Abrimos a las ${fmtTime(nextAt)} (excepción).`
          : ` Abrimos el ${fmtWeekday(nextAt)} a las ${fmtTime(nextAt)} (excepción).`
        : "";
  } else {
    extra =
      nextAt && web.nextChange?.willOpen
        ? isSameLocalDate(now, nextAt)
          ? ` Abrimos a las ${fmtTime(nextAt)}.`
          : ` Abrimos el ${fmtWeekday(nextAt)} a las ${fmtTime(nextAt)}.`
        : "";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {config.closedMessage} {extra}
      </div>
    </div>
  );
}
