// components/cart-context.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Detalle de cada ítem dentro de un combo
export type CartComboItem = {
  productId: number;             // requerido por el back
  name: string;
  qty: number;
  isMain?: boolean;
  option?: {                     // solo si el item es el principal y hay opción
    id: number;                  // ProductOption.id (REQUIRED si viene option)
    name: string;                // "Simple" | "Doble" | "Triple"
    extraPrice: number;          // 0 si no hay
  };
  // 👇 NUEVO: cuando proviene de una categoría incluida
  isInclusion?: boolean;         // lo usamos para detectarlo en el render
  inclusionId?: string;          // id de la ComboCategoryInclusion — requerido para armar inclusion_selections al checkear
  inclusionTitle?: string;       // ej. "Elegí tu bebida"
  unitPrice?: number;            // precio con la regla aplicada (descuento/tope/etc.)
  basePrice?: number;            // precio original del producto

  // 👇 NUEVO: cuando proviene del stepper de slots (no del formato legacy de items[])
  comboItemId?: number | null;
  slotIndex?: number;
  /** @deprecated usar options con qty — no soporta cantidad por opción (grupos allowsQuantity) */
  optionIds?: number[];
  options?: { id: number; qty: number }[];
};

export interface CartItem {
  uniqueId: string;
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  quantity: number;
  size?: string;                 // ← antes: "simple" | "doble" | "triple"
  observations?: string;
  finalPrice: number;
  isDefaultCategory?: boolean;

  // opción elegida (para productos o para el principal del combo)
  productOptionId?: number;      // id de productOptions (productOptions.id) - DEPRECATED: usar selectedOptions
  optionId?: number;             // id de Option (option.id) - DEPRECATED: usar selectedOptions
  optionName?: string;           // p.ej. "Simple" | "Doble" | "Triple" - DEPRECATED: usar selectedOptions
  priceExtra?: number | string;  // extra aplicado a esa opción - DEPRECATED: usar selectedOptions

  // —— NUEVO: soporte para múltiples opciones ——
  selectedOptions?: Array<{
    productOptionId: number;     // id de productOptions
    optionId: number;            // id de Option
    optionName: string;          // nombre de la opción
    tipo: string;                // "Tamaño", "Extra", etc.
    priceExtra: number;          // extra aplicado
    qty?: number;                // cantidad de esta opción (grupos allowsQuantity) — default 1
  }>;

  // —— NUEVO: soporte para combos ——
  kind?: "product" | "combo";    // si no viene, asumimos "product"
  comboItems?: CartComboItem[];  // detalle de lo que incluye el combo
  comboName?: string;            // opcional, alias del combo
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (uniqueId: string) => void;
  updateQuantity: (uniqueId: string, quantity: number) => void;
  updateItemPrice: (uniqueId: string, price: number, finalPrice: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/* =======================
   Helpers para mergeo
   ======================= */

// Firma estricta: dos items se mergean SOLO si son exactamente iguales
// (mismo producto + mismas opciones + sin observaciones).
// Igual al POS: "Doble + Bacon" nunca mergea con "Doble".
function getMergeSignature(it: CartItem): string | null {
  // con observaciones nunca se mergea
  if (it.observations && it.observations.trim() !== "") return null;

  const kind = it.kind || "product";

  if (kind !== "combo") {
    const prodId = Number(it.id) || 0;

    // Firma basada en TODOS los productOptionId ordenados numéricamente.
    // Sin fallback legacy: si dos items tienen distintas opciones (aunque sea
    // solo el extra "Bacon") producen firmas distintas y NO se mergean.
    const allOptIds = (it.selectedOptions ?? [])
      .map(o => Number(o.productOptionId))
      .filter(id => Number.isFinite(id) && id > 0)
      .sort((a, b) => a - b)
      .join(',');

    return `prod|${prodId}|opts:${allOptIds}`;
  }

  // Combo: firmamos por combo id + selectedOptions (extras como Bacon) + composición interna
  const comboId = Number(it.id) || 0;

  // selectedOptions captura tamaño + extras del combo (ej: Doble, Bacon)
  const comboOptIds = (it.selectedOptions ?? [])
    .map(o => Number(o.productOptionId))
    .filter(id => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b)
    .join(',');

  const inner = (it.comboItems || [])
    .map(ci => ({
      pid: Number(ci.productId) || 0,
      qty: Number(ci.qty) || 1,
      opt: ci?.option ? Number(ci.option.id) || 0 : 0,
      inc: !!ci.isInclusion,
    }))
    .sort((a, b) => a.pid - b.pid || a.opt - b.opt || (a.inc === b.inc ? 0 : a.inc ? 1 : -1));

  return `combo|${comboId}|opts:${comboOptIds}|${JSON.stringify(inner)}`;
}

// Precio unitario robusto a partir del item actual
function unitPriceOf(it: CartItem): number {
  const q = Math.max(1, Number(it.quantity) || 1);
  const byFinal = Number(it.finalPrice);
  if (Number.isFinite(byFinal) && byFinal > 0) return byFinal / q;

  const byPrice = Number(it.price);
  if (Number.isFinite(byPrice) && byPrice > 0) return byPrice;

  return 0;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (item: CartItem) => {
    setItems(prev => {
      // aseguramos uniqueId si no vino
      const newItem: CartItem = {
        ...item,
        uniqueId: item.uniqueId ?? `${item.id}-${Date.now()}`,
      };

      // si no puede mergearse (porque tiene observations), entra directo
      const sig = getMergeSignature(newItem);
      if (!sig) return [...prev, newItem];

      // buscamos un existente con la misma firma
      const idx = prev.findIndex(p => getMergeSignature(p) === sig);
      if (idx === -1) return [...prev, newItem];

      // ✅ merge: sumamos cantidades y recalculamos finalPrice con un unit coherente
      const curr = prev[idx];

      const currQty = Number(curr.quantity) || 0;
      const addQty  = Number(newItem.quantity) || 0;

      // tomamos el unit del nuevo si viene distinto; si no, del existente
      const addUnit  = unitPriceOf(newItem);
      const currUnit = unitPriceOf(curr);
      const unit     = Number.isFinite(addUnit) && addUnit > 0 ? addUnit : currUnit;

      const merged: CartItem = {
        ...curr,
        // 🔒 CRÍTICO: opciones siempre del NUEVO item (igual que el POS).
        // Si usáramos ...curr, el item existente "ganaría" con sus opciones
        // aunque el nuevo tenga opciones distintas (ej: bacon vs sin bacon).
        selectedOptions: newItem.selectedOptions,
        productOptionId: newItem.productOptionId,
        optionId:        newItem.optionId,
        optionName:      newItem.optionName,
        priceExtra:      newItem.priceExtra,
        size:            newItem.size,
        price:           newItem.price,
        quantity: currQty + addQty,
        finalPrice: Math.round(unit * (currQty + addQty)),
        // 🔒 IMPORTANTE: Deep copy de comboItems para evitar mutaciones
        comboItems: curr.comboItems ? [...curr.comboItems.map(ci => ({ ...ci }))] : undefined,
      };

      const copy = [...prev];
      copy[idx] = merged;
      return copy;
    });
  };

  const removeFromCart = (uniqueId: string) => {
    setItems((prev) => prev.filter((item) => item.uniqueId !== uniqueId));
  };

  const updateItemPrice = (uniqueId: string, price: number, finalPrice: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.uniqueId === uniqueId ? { ...item, price, finalPrice } : item
      )
    );
  };

  const updateQuantity = (uniqueId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(uniqueId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.uniqueId === uniqueId
          ? {
              ...item,
              quantity,
              // conserva el precio unitario actual (con redondeo)
              finalPrice: Math.round((item.finalPrice / item.quantity) * quantity),
              // 🔒 IMPORTANTE: Deep copy de comboItems para preservar qty original
              comboItems: item.comboItems ? [...item.comboItems.map(ci => ({ ...ci }))] : undefined,
            }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => total + item.finalPrice, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateItemPrice,
        clearCart,
        getTotalItems,
        getTotalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
