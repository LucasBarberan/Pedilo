// lib/pricing.ts
export type QuoteItemProductView = {
  kind: "PRODUCT";
  productId: number;
  name: string;
  qty: number;
  unitListPrice: string;
  discountedUnitPrice: string;
  unitFinalPrice: string;
  lineTotal: string;
  options?: Array<{ id: number; name: string; extra: string }>;
  appliedPriceList?: {
    itemId: number;
    listName: string;
    priceType: string;
    value: string;
    savings: string;
  };
  appliedPromotion?: {
    name: string;
    priceType: string;
    savings: string;
    freeUnits?: number;
  };
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

export type PromoInfo = {
  type: string;
  rawValue: string;
  units: number;
  listName?: string;
  label?: string | null;
  nthFreeRuleBuy?: number | null;
  nthFreeRuleFree?: number | null;
};

export function buildPromoLabel(promo: PromoInfo): string {
  if (promo.label) return promo.label;
  const raw = Number(promo.rawValue);
  switch (promo.type) {
    case "PERCENT_OFF":
      return `${Number.isFinite(raw) ? Math.round(raw) : ""}% OFF`;
    case "AMOUNT_OFF":
      return `$${Number.isFinite(raw) ? raw.toLocaleString("es-AR") : ""} OFF`;
    case "FIXED_PRICE":
      return "Precio especial";
    case "NTH_FREE": {
      const buy = promo.nthFreeRuleBuy;
      const free = promo.nthFreeRuleFree;
      if (buy != null && free != null) return `Llevá ${buy + free} pagá ${buy}`;
      return `${promo.units}x${promo.units - (promo.nthFreeRuleFree ?? 1)}`;
    }
    case "QUANTITY_BUNDLE":
      return promo.units > 1 ? `Pack x${promo.units}` : "Precio de pack";
    default:
      return promo.listName ?? "Promo";
  }
}

// ===== quoteCombo =====

export type QuoteComboItem = {
  productId: number;
  quantity: number;
  optionIds?: number[];
};

export type QuoteItemComboView = {
  kind: "COMBO";
  productTemplateId: number;
  name: string;
  qty: number;
  breakdown: {
    basePerCombo: string;
    originalPerCombo: string;
    inclusionsPerCombo: string;
    optionsPerCombo: string;
    effectivePerCombo: string;
  };
  children: Array<{
    productId: number;
    name: string;
    qty: number;
    unitListPrice: string;
    unitFinalPrice: string;
    lineTotal: string;
    isInclusion: boolean;
    options?: Array<{ id: number; name: string; extra: string }>;
  }>;
  appliedPriceList?: {
    itemId: number;
    listName: string;
    listCode: string | null;
    priceType: string;
    value: string;
    savings: string;
  };
  appliedPromotion?: {
    name: string;
    priceType: string;
    savings: string;
  };
  comment?: string | null;
};

export async function quoteCombo({
  comboId,
  qty,
  items,
  channel = "WEB",
  baseUrl,
  signal,
}: {
  comboId: number;
  qty: number;
  items: QuoteComboItem[];
  channel?: "WEB" | "POS" | "DELIVERY";
  baseUrl?: string | null;
  signal?: AbortSignal;
}): Promise<QuoteItemComboView | null> {
  try {
    const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
    if (!BASE) return null;

    const body = {
      channel,
      lines: [
        {
          type: "COMBO",
          product_template_id: comboId,
          combo_quantity: qty,
          items: items.map((it) => ({
            product_id: it.productId,
            quantity_per_combo: it.quantity,
            option_ids: it.optionIds ?? [],
          })),
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
    const item = Array.isArray(json?.combos) ? json.combos[0] : null;
    if (!item || item.kind !== "COMBO") return null;
    return item as QuoteItemComboView;
  } catch {
    return null;
  }
}

// ===== quoteCart: envía todo el carrito en un solo request =====

export type CartProductLine = {
  type: "PRODUCT";
  productId: number;
  qty: number;
  optionIds: number[];
  comment?: string | null;
};

export type CartComboLine = {
  type: "COMBO";
  comboId: number;
  qty: number;
  items: QuoteComboItem[];
};

export type CartLine = CartProductLine | CartComboLine;

export type QuoteCartSummary = {
  savings: number;
  promoName: string | null;
  total: number;
  originalSubtotal: number;
};

export type QuoteCartResponse = {
  items: (QuoteItemProductView | QuoteItemComboView | null)[];
  summary: QuoteCartSummary | null;
};

export async function quoteCart(
  lines: CartLine[],
  { channel = "WEB", baseUrl, signal }: QuoteOptions = {}
): Promise<QuoteCartResponse> {
  const empty: QuoteCartResponse = { items: lines.map(() => null), summary: null };
  if (!lines.length) return { items: [], summary: null };
  const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!BASE) return empty;

  const body = {
    channel,
    lines: lines.map((l) =>
      l.type === "PRODUCT"
        ? { type: "PRODUCT", product_id: l.productId, quantity: l.qty, option_ids: l.optionIds, comment: l.comment ?? null }
        : {
            type: "COMBO",
            product_template_id: l.comboId,
            combo_quantity: l.qty,
            items: l.items.map((it) => ({ product_id: it.productId, quantity_per_combo: it.quantity, option_ids: it.optionIds ?? [] })),
          }
    ),
  };

  try {
    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return empty;

    const json = await res.json();
    const itemsArr = Array.isArray(json?.items) ? json.items : [];
    const combosArr = Array.isArray(json?.combos) ? json.combos : [];
    let itemIdx = 0, comboIdx = 0;
    const items: (QuoteItemProductView | QuoteItemComboView | null)[] = lines.map((l) =>
      l.type === "PRODUCT" ? (itemsArr[itemIdx++] ?? null) : (combosArr[comboIdx++] ?? null)
    );

    const priceListSavings = Number(json?.priceListSavings) || 0;
    const promotionSavings = Number(json?.promotionSavings) || 0;
    const totalSavings = priceListSavings + promotionSavings;
    const total    = Number(json?.total);
    const subtotal = Number(json?.subtotal);
    const summary: QuoteCartSummary | null =
      totalSavings > 0
        ? {
            savings: totalSavings,
            promoName: json?.priceListName ?? (promotionSavings > 0 ? "Promociones" : null),
            total: Number.isFinite(total) ? total : 0,
            originalSubtotal: Number.isFinite(subtotal) ? subtotal : 0,
          }
        : null;

    return { items, summary };
  } catch {
    return empty;
  }
}

