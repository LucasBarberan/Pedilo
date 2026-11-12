// CONTRATO ÚNICO DE ÓRDENES (change `estandarizar-contrato-combos`) — serializador ÚNICO de Pedilo.
//
// Cotizar (`/pricing/quote`), pedir (`POST /orders`) y mandar una comanda de mesa reciben exactamente las MISMAS `lines[]`; este módulo es el único lugar
// que las arma a partir del carrito, así que no pueden divergir. Ver Backend/docs/order-contract/README.md.
//
//   lines[]    PRODUCT { type, product_id, quantity, options?, comment? }
//              COMBO   { type, product_template_id, combo_quantity, slots[], inclusion_selections?, comment? }
//   payments[] { paymentMethodId, amount }  (el monto es el total que cotizó el servidor)
//
// El cliente NO manda precios, nombres ni totales. Un combo se manda siempre con UN SLOT POR UNIDAD de cada ítem del combo (también los ítems fijos, sin
// opciones): un combo incompleto lo rechaza el servidor.

import type { CartItem } from "@/components/cart-context";

export type ContractOption = { id: number; qty?: number };
export type ContractSlot = { combo_item_id: number; slot_index: number; options?: ContractOption[]; comment?: string };
export type ContractProductLine = { type: "PRODUCT"; product_id: number; quantity: number; options?: ContractOption[]; comment?: string };
export type ContractComboLine = {
  type: "COMBO";
  product_template_id: number;
  combo_quantity: number;
  slots: ContractSlot[];
  inclusion_selections?: { inclusion_id: number; product_ids: number[] }[];
  comment?: string;
};
export type ContractLine = ContractProductLine | ContractComboLine;
export type ContractPaymentLine = { paymentMethodId: number; amount: number };

const toInt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

const cleanComment = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

/** Modificadores como `options: [{ id, qty? }]`: ids únicos (repetidos suman), ordenados por id y sin `qty` cuando vale 1. */
export function normalizeOptions(input: Array<{ id: number; qty?: number } | number> | null | undefined): ContractOption[] | undefined {
  const byId = new Map<number, number>();
  for (const o of input ?? []) {
    const id = typeof o === "number" ? o : Number(o?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const qty = typeof o === "number" ? 1 : Math.max(1, toInt(o.qty ?? 1));
    byId.set(id, (byId.get(id) ?? 0) + qty);
  }
  if (byId.size === 0) return undefined;
  return [...byId.entries()].sort(([a], [b]) => a - b).map(([id, qty]) => (qty === 1 ? { id } : { id, qty }));
}

/**
 * Un slot por cada unidad de cada ítem del combo (`combo.slots` del Backend): los slots elegidos por el cliente llevan sus opciones y comentario; los demás
 * (ítems fijos, sin modificadores) van igual, sin opciones. `chosen` se busca por `comboItemId` + `slotIndex`.
 */
export function completeComboSlots(
  allSlots: Array<{ comboItemId: number; slotIndex: number }>,
  chosen: Array<{ comboItemId: number; slotIndex: number; options?: Array<{ id: number; qty?: number }>; comment?: string | null }>
): ContractSlot[] {
  const byKey = new Map(chosen.map((c) => [`${c.comboItemId}:${c.slotIndex}`, c]));
  return allSlots.map((s) => {
    const sel = byKey.get(`${s.comboItemId}:${s.slotIndex}`);
    const options = normalizeOptions(sel?.options);
    const comment = cleanComment(sel?.comment);
    return {
      combo_item_id: Number(s.comboItemId),
      slot_index: Number(s.slotIndex),
      ...(options ? { options } : {}),
      ...(comment ? { comment } : {}),
    };
  });
}

/** La línea del contrato de UN ítem del carrito (1:1 con el carrito: el índice de la cotización coincide con el del carrito). */
export function cartItemToLine(item: CartItem): ContractLine {
  if (item.kind === "combo") {
    const comboItems = item.comboItems ?? [];
    const slotItems = comboItems.filter((c) => !c.isInclusion && c.comboItemId != null);
    if (slotItems.length === 0) {
      throw new Error(`El combo "${item.name}" no tiene slots: volvé a agregarlo desde el combo.`);
    }
    const slots: ContractSlot[] = slotItems.map((c) => {
      const options = normalizeOptions(c.options ?? (c.optionIds ?? []));
      const comment = cleanComment((c as { comment?: string }).comment);
      return {
        combo_item_id: Number(c.comboItemId),
        slot_index: Number(c.slotIndex ?? 0),
        ...(options ? { options } : {}),
        ...(comment ? { comment } : {}),
      };
    });

    // Elecciones por categoría (inclusiones): una entrada por inclusión con los productos elegidos.
    const groups = new Map<number, number[]>();
    for (const c of comboItems) {
      if (!c.isInclusion || c.inclusionId == null) continue;
      const id = Number(c.inclusionId);
      groups.set(id, [...(groups.get(id) ?? []), Number(c.productId)]);
    }
    const comment = cleanComment(item.observations);
    return {
      type: "COMBO",
      product_template_id: Number(item.id),
      combo_quantity: Math.max(1, toInt(item.quantity)),
      slots,
      ...(groups.size > 0
        ? { inclusion_selections: [...groups.entries()].map(([inclusion_id, product_ids]) => ({ inclusion_id, product_ids })) }
        : {}),
      ...(comment ? { comment } : {}),
    };
  }

  const fromSelected = (item.selectedOptions ?? []).map((o) => ({ id: Number(o.productOptionId), qty: Number(o.qty ?? 1) }));
  const options = normalizeOptions(fromSelected.length > 0 ? fromSelected : item.productOptionId ? [{ id: Number(item.productOptionId) }] : []);
  const comment = cleanComment(item.observations);
  return {
    type: "PRODUCT",
    product_id: Number(item.id),
    quantity: Math.max(1, toInt(item.quantity)),
    ...(options ? { options } : {}),
    ...(comment ? { comment } : {}),
  };
}

export function buildOrderLines(items: CartItem[]): ContractLine[] {
  return items.map(cartItemToLine);
}

export type QuoteChannel = "WEB" | "POS" | "DELIVERY";

export interface QuoteRequestParams {
  lines: ContractLine[];
  channel?: QuoteChannel;
  /** Medio de pago elegido: el descuento/recargo del medio ya viene en el total cotizado. */
  paymentMethodId?: number | null;
  loyaltyCustomerId?: number | null;
  loyaltyPointsToRedeem?: number | null;
}

/** Cuerpo de `POST /api/pricing/quote`: las mismas `lines[]` que el pedido; el medio de pago va en `payments[]` sin monto (el total aún se calcula). */
export function buildQuoteRequest(p: QuoteRequestParams) {
  return {
    channel: p.channel ?? "WEB",
    lines: p.lines,
    ...(p.paymentMethodId != null ? { payments: [{ paymentMethodId: p.paymentMethodId }] } : {}),
    ...(p.loyaltyCustomerId != null ? { loyaltyCustomerId: p.loyaltyCustomerId } : {}),
    ...(p.loyaltyPointsToRedeem != null && p.loyaltyPointsToRedeem > 0 ? { loyaltyPointsToRedeem: p.loyaltyPointsToRedeem } : {}),
  };
}

export interface OrderRequestParams {
  lines: ContractLine[];
  /** Total que cotizó el servidor con este medio de pago (incluye descuento/recargo del medio y canje de puntos; no incluye el envío). */
  paymentMethodId: number;
  total: number;
  fulfillment: "DELIVERY" | "TAKEAWAY";
  deliveryInfo: Record<string, unknown>;
  customerId?: number | null;
  loyaltyCustomerId?: number | null;
  loyaltyPointsToRedeem?: number | null;
}

/** Cuerpo de `POST /api/orders` (canal WEB): las mismas líneas que la cotización más el pago por el total cotizado. */
export function buildOrderRequest(p: OrderRequestParams) {
  return {
    lines: p.lines,
    payments: [{ paymentMethodId: p.paymentMethodId, amount: Math.round(p.total) }] as ContractPaymentLine[],
    channel: "WEB" as const,
    fulfillment: p.fulfillment,
    delivery_info: p.deliveryInfo,
    ...(p.customerId != null ? { customerId: p.customerId } : {}),
    ...(p.loyaltyCustomerId != null ? { loyaltyCustomerId: p.loyaltyCustomerId } : {}),
    ...(p.loyaltyPointsToRedeem != null && p.loyaltyPointsToRedeem > 0 ? { loyaltyPointsToRedeem: p.loyaltyPointsToRedeem } : {}),
  };
}

export interface TableCommandParams {
  lines: ContractLine[];
  clientRequestId: string;
  guestName: string;
  notes?: string | null;
  guestCount?: number;
}

/** Cuerpo de la comanda de mesa del comensal: las mismas `lines[]`, sin pago (se cobra al cerrar la cuenta). */
export function buildTableCommandRequest(p: TableCommandParams) {
  return {
    clientRequestId: p.clientRequestId,
    guestName: p.guestName,
    notes: p.notes ?? null,
    lines: p.lines,
    ...(p.guestCount != null ? { guestCount: p.guestCount } : {}),
  };
}
