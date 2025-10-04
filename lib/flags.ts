// lib/flags.ts
export function parseBoolean(v: string | undefined, fallback = true) {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export const STORE_OPEN = parseBoolean(process.env.NEXT_PUBLIC_STORE_OPEN, true);
export const STORE_CLOSED_MSG =
  process.env.NEXT_PUBLIC_STORE_CLOSED_MSG ??
  "⚠️ El local está cerrado en este momento.";

// === NUEVO: flags para banner informativo ===
export const INFO_BANNER_ENABLED = parseBoolean(
  process.env.NEXT_PUBLIC_INFO_BANNER_ENABLED,
  false
);

export const INFO_BANNER_MSG =
  process.env.NEXT_PUBLIC_INFO_BANNER_MSG ?? "";

/**
 * Nivel visual del banner informativo:
 *  - "info" (azul), "warning" (amarillo), "success" (verde)
 */
export const INFO_BANNER_LEVEL = (() => {
  const raw = process.env.NEXT_PUBLIC_INFO_BANNER_LEVEL ?? "info";
  const v = raw.trim().toLowerCase();
  return ["info", "warning", "success"].includes(v) ? v : "info";
})();