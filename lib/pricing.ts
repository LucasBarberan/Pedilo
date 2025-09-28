// lib/pricing.ts
export type QuoteItemProductView = {
  kind: "PRODUCT";
  productId: number;
  name: string;
  qty: number;
  unitList: string;          // precio de lista unitario (sin promo)
  unitPrice: string;         // precio unitario EFECTIVO (promedio si hay units limitadas)
  total: string;             // unitPrice * qty
  options?: Array<{ id: number; name: string; extra: string }>;
  promo?: { type: string; value: string; units: number; applyToOptions: boolean };
  comment?: string | null;
};

export async function quoteProduct({
  productId,
  qty,
  optionIds,
  channel = "WEB",
  comment,
}: {
  productId: number;
  qty: number;
  optionIds?: number[];
  channel?: "WEB" | "POS" | "DELIVERY";
  comment?: string;
}): Promise<QuoteItemProductView | null> {
  try {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!BASE) return null;

    const body = {
      channel,
      lines: [
        {
          type: "PRODUCT",
          product_id: productId,
          quantity: qty,
          option_ids: optionIds ?? [],
          comment: comment ?? null,
        },
      ],
    };

    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const item = Array.isArray(json?.items) ? json.items[0] : null;
    if (!item || item.kind !== "PRODUCT") return null;
    return item as QuoteItemProductView;
  } catch {
    return null;
  }
}
