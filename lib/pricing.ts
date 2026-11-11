// lib/pricing.ts
//
// Toda cotización sale del serializador único (`lib/orderLines.ts`, contrato único de órdenes): las MISMAS `lines[]` que el pedido.
import { buildQuoteRequest, normalizeOptions, type ContractLine, type ContractSlot, type QuoteChannel } from "@/lib/orderLines";
import { businessErrorMessage } from "@/lib/user-facing-error";
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
  channel?: QuoteChannel;
  baseUrl?: string | null;
  signal?: AbortSignal;
  /** Medio de pago elegido: el Backend devuelve su descuento/recargo ya redondeado (fuente de verdad del checkout). */
  paymentMethodId?: number | null;
  loyaltyCustomerId?: number | null;
  loyaltyPointsToRedeem?: number | null;
};

export async function quoteProduct({
  productId,
  qty,
  options,
  channel = "WEB",
  comment,
  baseUrl,
  signal,
}: {
  productId: number;
  qty: number;
  options?: { id: number; qty?: number }[];
  channel?: QuoteChannel;
  comment?: string;
  baseUrl?: string | null;
  signal?: AbortSignal;
}): Promise<QuoteItemProductView | null> {
  try {
    const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
    if (!BASE) return null;

    const opts = normalizeOptions(options);
    const body = buildQuoteRequest({
      channel,
      lines: [
        {
          type: "PRODUCT",
          product_id: productId,
          quantity: qty,
          ...(opts ? { options: opts } : {}),
          ...(comment?.trim() ? { comment: comment.trim() } : {}),
        },
      ],
    });

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

export type QuoteComboSlotInput = {
  combo_item_id: number;
  slot_index: number;
  options?: { id: number; qty?: number }[];
  comment?: string;
};

export type QuoteComboInclusionInput = {
  inclusion_id: number;
  product_ids: number[];
};

export async function quoteComboSlots({
  comboId,
  qty,
  slots,
  inclusionSelections,
  channel = "WEB",
  baseUrl,
  signal,
}: {
  comboId: number;
  qty: number;
  slots: QuoteComboSlotInput[];
  inclusionSelections?: QuoteComboInclusionInput[];
  channel?: "WEB" | "POS" | "DELIVERY";
  baseUrl?: string | null;
  signal?: AbortSignal;
}): Promise<QuoteItemComboView | null> {
  try {
    const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
    if (!BASE) return null;

    const contractSlots: ContractSlot[] = slots.map((s) => {
      const options = normalizeOptions(s.options);
      const comment = s.comment?.trim();
      return {
        combo_item_id: s.combo_item_id,
        slot_index: s.slot_index,
        ...(options ? { options } : {}),
        ...(comment ? { comment } : {}),
      };
    });
    const body = buildQuoteRequest({
      channel,
      lines: [
        {
          type: "COMBO",
          product_template_id: comboId,
          combo_quantity: qty,
          slots: contractSlots,
          ...(inclusionSelections?.length ? { inclusion_selections: inclusionSelections } : {}),
        },
      ],
    });

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

export type QuoteCartSummary = {
  savings: number;
  promoName: string | null;
  total: number;
  originalSubtotal: number;
};

/** Ajuste del medio de pago calculado por el Backend (solo si se cotizó con `paymentMethodId`). */
export type QuotePaymentAdjustment = {
  discount: number;
  surcharge: number;
  /** Total del carrito ya con descuento/recargo del medio, canje de puntos y redondeo (sin envío). */
  total: number;
};

export type QuoteCartResponse = {
  items: (QuoteItemProductView | QuoteItemComboView | null)[];
  summary: QuoteCartSummary | null;
  payment?: QuotePaymentAdjustment | null;
  /** Motivo (en español, apto para el cliente) cuando el backend rechazó el carrito por una regla de negocio (HTTP 422),
   *  ej. un producto que ya no se vende por la tienda online. Ausente en cualquier otro fallo. */
  error?: string;
};

export async function quoteCart(
  lines: ContractLine[],
  { channel = "WEB", baseUrl, signal, paymentMethodId, loyaltyCustomerId, loyaltyPointsToRedeem }: QuoteOptions = {}
): Promise<QuoteCartResponse> {
  const empty: QuoteCartResponse = { items: lines.map(() => null), summary: null };
  if (!lines.length) return { items: [], summary: null };
  const BASE = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!BASE) return empty;

  const body = buildQuoteRequest({ channel, lines, paymentMethodId, loyaltyCustomerId, loyaltyPointsToRedeem });

  try {
    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const error = businessErrorMessage(res.status, await res.text().catch(() => ""));
      return error ? { ...empty, error } : empty;
    }

    const json = await res.json();
    const itemsArr = Array.isArray(json?.items) ? json.items : [];
    const combosArr = Array.isArray(json?.combos) ? json.combos : [];
    let itemIdx = 0, comboIdx = 0;
    const items: (QuoteItemProductView | QuoteItemComboView | null)[] = lines.map((l) =>
      l.type === "PRODUCT" ? (itemsArr[itemIdx++] ?? null) : (combosArr[comboIdx++] ?? null)
    );

    const promotionSavings = Number(json?.promotionSavings) || 0;
    const total    = Number(json?.total);
    const subtotal = Number(json?.subtotal);
    // El total final se redondea al múltiplo de `priceRoundingStep` más cercano
    // (ver roundToStep en el Backend) — sumar priceListSavings+promotionSavings "a
    // mano" ignoraba ese ajuste y mostraba un descuento que no cerraba contra
    // subtotal-total (ej. "$10500 - $1050" mostrando un total de "$9500" en vez de
    // "$9450", bug real reportado). subtotal-total SIEMPRE coincide con lo que el
    // cliente ve en pantalla, sea cual sea el origen del ajuste.
    const totalSavings =
      Number.isFinite(subtotal) && Number.isFinite(total) ? subtotal - total : 0;
    const summary: QuoteCartSummary | null =
      totalSavings > 0
        ? {
            savings: totalSavings,
            promoName: json?.priceListName ?? (promotionSavings > 0 ? "Promociones" : null),
            total: Number.isFinite(total) ? total : 0,
            originalSubtotal: Number.isFinite(subtotal) ? subtotal : 0,
          }
        : null;

    const payment: QuotePaymentAdjustment | null =
      paymentMethodId != null && Number.isFinite(total)
        ? {
            discount: Number(json?.paymentDiscount) || 0,
            surcharge: Number(json?.paymentSurcharge) || 0,
            total,
          }
        : null;

    return { items, summary, payment };
  } catch {
    return empty;
  }
}

