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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (item: CartItem) => {
    setItems((prev) => [...prev, item]);
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
              // conserva el precio unitario actual
              finalPrice: (item.finalPrice / item.quantity) * quantity,
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
