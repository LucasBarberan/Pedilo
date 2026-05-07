// lib/flags.ts
// Todas las constantes de configuración de negocio (STORE_OPEN, STORE_CLOSED_MSG,
// INFO_BANNER_*, PICKUP_ONLY_MSG) fueron migradas a la DB via OnlineStoreConfig.
// Consultar: lib/api/onlineConfig.ts + lib/hooks/useOnlineConfig.ts

export function parseBoolean(v: string | undefined, fallback = true) {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}
