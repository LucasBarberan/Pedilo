// lib/api/business.ts
import { getClientApiBase } from "@/lib/apiBase.client";

export type Channel = "POS" | "WEB";

export type ChannelStatus = {
  channel: Channel;
  open: boolean;
  reason: "REGULAR" | "EXCEPTION" | "CLOSED_DAY" | "NO_RANGE";
  currentRange?: { open: string; close: string } | null;
  nextChange?: { at: string; willOpen: boolean } | null; // ISO string
};

export type CombinedStatus = {
  now: string; // ISO
  timezone: string;
  dow: "SUNDAY"|"MONDAY"|"TUESDAY"|"WEDNESDAY"|"THURSDAY"|"FRIDAY"|"SATURDAY";
  minutesNow: number;
  pos: ChannelStatus;
  web: ChannelStatus;
};

// demo-mode Fase 5 (tasks.md 5.5): sin cookie de demo, comportamiento actual sin cambios
// (getClientApiBase() cae a NEXT_PUBLIC_API_URL).
const API = getClientApiBase() ?? process.env.NEXT_PUBLIC_API_URL; // ej: http://localhost:3000/api

export async function fetchBusinessStatus(): Promise<CombinedStatus> {
  if (!API) throw new Error("Falta NEXT_PUBLIC_API_URL");
  const res = await fetch(`${API}/business/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo obtener el estado del negocio");
  return res.json();
}
