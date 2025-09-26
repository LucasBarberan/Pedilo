// lib/channel.ts
export type ChannelInput = "POS" | "DELIVERY" | "BOTH" | string | undefined | null;

export function normalizeChannel(ch?: ChannelInput): "POS" | "DELIVERY" | "BOTH" | undefined {
  if (!ch) return undefined;
  if (ch === "POS") return "POS";
  if (ch === "DELIVERY") return "DELIVERY";
  return "BOTH";
}

export function isAllowedForDelivery(ch?: ChannelInput) {
  const n = normalizeChannel(ch);
  // mostramos en la web solo DELIVERY o BOTH (si viene vacío, por las dudas lo tratamos como BOTH)
  return !n || n === "DELIVERY" || n === "BOTH";
}
