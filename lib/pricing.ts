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

type QuoteOptions = {
  channel?: "WEB" | "POS" | "DELIVERY";
  baseUrl?: string | null;
  signal?: AbortSignal;
};

export async function quoteProduct({
  productId,
  qty,
  optionIds,
  channel = "WEB",
  comment,
  baseUrl,
  signal,
}: {
  productId: number;
  qty: number;
  optionIds?: number[];
  channel?: "WEB" | "POS" | "DELIVERY";
  comment?: string;
  baseUrl?: string | null;
  signal?: AbortSignal;
}): Promise<QuoteItemProductView | null> {
  try {
    const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
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
      signal,
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

export type QuoteProductsBatchMap = Record<number, { unit: number; list: number | null; hasPromo: boolean }>;

export async function quoteProductsBatch(
  ids: number[],
  { channel = "WEB", baseUrl, signal }: QuoteOptions = {}
): Promise<QuoteProductsBatchMap> {
  const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!BASE || !ids.length) return {};

  const lines = ids.map((productId) => ({
    type: "PRODUCT",
    product_id: productId,
    quantity: 1,
    option_ids: [],
  }));

  try {
    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ channel, lines }),
      signal,
    });
    if (!res.ok) return {};

    const json = await res.json();
    const items = Array.isArray((json as any)?.items) ? (json as any).items : [];

    const map: QuoteProductsBatchMap = {};
    for (const raw of items) {
      if (!raw || raw.kind !== "PRODUCT") continue;

      const productId = Number(raw.productId);
      if (!Number.isFinite(productId)) continue;

      const unit = Number(raw.unitPrice);
      const list = Number(raw.unitList);
      const hasUnit = Number.isFinite(unit);
      const hasList = Number.isFinite(list);

      map[productId] = {
        unit: hasUnit ? unit : NaN,
        list: hasList ? list : null,
        hasPromo: !!raw.promo && hasUnit && hasList && unit < list,
      };
    }

    return map;
  } catch {
    return {};
  }
}
