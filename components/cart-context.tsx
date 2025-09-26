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
  inclusionTitle?: string;       // ej. "Elegí tu bebida"
  unitPrice?: number;            // precio con la regla aplicada (descuento/tope/etc.)
  basePrice?: number;            // precio original del producto
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
  productOptionId?: number;      // id de productOptions (productOptions.id)
  optionId?: number;             // id de Option (option.id)
  optionName?: string;           // p.ej. "Simple" | "Doble" | "Triple"
  priceExtra?: number | string;  // extra aplicado a esa opción

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
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/* =======================
   Helpers para mergeo
   ======================= */

// Firma para saber si dos items pueden mergearse (solo si NO tienen observaciones)
function getMergeSignature(it: CartItem): string | null {
  // si hay observaciones, NO se mergea
  if (it.observations && it.observations.trim() !== "") return null;

  const kind = it.kind || "product";

  if (kind !== "combo") {
    // Producto suelto: mismo product_id + misma opción + mismo tamaño/alias
    const prodId = Number(it.id) || 0;
    const optId  = Number(it.productOptionId || it.optionId || 0) || 0;
    const size   = String(it.size || it.optionName || "").toLowerCase();
    return `prod|${prodId}|${optId}|${size}`;
  }

  // Combo: firmamos por combo id, opción principal y composición interna
  const comboId = Number(it.id) || 0;
  const optId   = Number(it.productOptionId || it.optionId || 0) || 0;

  // Normalizamos items internos para que el orden no afecte
  const inner = (it.comboItems || [])
    .map(ci => ({
      pid: Number(ci.productId) || 0,
      qty: Number(ci.qty) || 1,
      opt: ci?.option ? Number(ci.option.id) || 0 : 0,
      inc: !!ci.isInclusion,
    }))
    .sort((a, b) => a.pid - b.pid || a.opt - b.opt || (a.inc === b.inc ? 0 : a.inc ? 1 : -1));

  return `combo|${comboId}|${optId}|${JSON.stringify(inner)}`;
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
        quantity: currQty + addQty,
        finalPrice: Math.round(unit * (currQty + addQty)),
      };

      const copy = [...prev];
      copy[idx] = merged;
      return copy;
    });
  };

  const removeFromCart = (uniqueId: string) => {
    setItems((prev) => prev.filter((item) => item.uniqueId !== uniqueId));
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
