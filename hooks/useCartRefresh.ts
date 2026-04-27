"use client";

import { useState, useCallback } from "react";
import { useCart } from "@/components/cart-context";
import { quoteProduct } from "@/lib/pricing";

export function useCartRefresh(): {
  refreshCartPrices: () => Promise<void>;
  isRefreshing: boolean;
} {
  const { items, updateItemPrice } = useCart();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshCartPrices = useCallback(async () => {
    const products = items.filter((it) => it.kind !== "combo");
    if (!products.length) return;

    setIsRefreshing(true);
    try {
      await Promise.all(
        products.map(async (item) => {
          const optionIds = (item.selectedOptions ?? []).map(
            (o) => o.productOptionId
          );
          const quote = await quoteProduct({
            productId: item.id,
            qty: item.quantity,
            optionIds,
            comment: item.observations,
          });
          if (!quote) return;
          const unit = Number(quote.unitPrice);
          const total = Number(quote.total);
          if (Number.isFinite(unit) && unit > 0) {
            updateItemPrice(item.uniqueId, unit, Math.round(total));
          }
        })
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [items, updateItemPrice]);

  return { refreshCartPrices, isRefreshing };
}
