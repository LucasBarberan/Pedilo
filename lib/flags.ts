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