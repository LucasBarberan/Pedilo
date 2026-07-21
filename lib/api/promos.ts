export type ActivePromo = {
  id: number;
  priceListId: number;
  priceListName: string;
  scope: string;
  categoryId?: number | null;
  productId?: number | null;
  productTemplateId?: number | null;
  priceType: string;
  value: number;
  minQtyPerItem?: number | null;
  maxUnitsPerOrder?: number | null;
  nthFreeRuleBuy?: number | null;
  nthFreeRuleFree?: number | null;
  label?: string | null;
  targetName?: string | null;
};

export function buildActivePromoLabel(promo: ActivePromo): string {
  if (promo.label) return promo.label;
  const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;
  const target = promo.targetName ? ` ${promo.targetName}` : "";
  switch (promo.priceType) {
    case "QUANTITY_BUNDLE": {
      const qty = promo.minQtyPerItem ?? 1;
      return `${qty}x${target} por ${fmt(promo.value)}`;
    }
    case "NTH_FREE": {
      const buy = promo.nthFreeRuleBuy ?? 2;
      const free = promo.nthFreeRuleFree ?? 1;
      return `Llevá ${buy + free}${target}, pagá ${buy}`;
    }
    case "VOLUME_BREAK": {
      const qty = promo.minQtyPerItem ?? 2;
      return `${target.trim() || "Productos"}: ${fmt(promo.value)} c/u comprando ${qty}+`;
    }
    default:
      return promo.priceListName;
  }
}

export async function fetchActivePromos(
  baseUrl?: string | null,
  signal?: AbortSignal,
  channel: "WEB" | "POS" = "WEB",
): Promise<ActivePromo[]> {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.replace(/\/$/, "");
  if (!base) return [];
  try {
    const res = await fetch(`${base}/price-lists/active-promos?channel=${channel}`, { signal });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}
