"use client";

import { useState, useCallback } from "react";
import { useCart, type CartItem } from "@/components/cart-context";
import { quoteCart, type CartLine, type QuoteComboItem, type QuoteCartSummary, type QuoteItemProductView, type QuoteItemComboView } from "@/lib/pricing";

export function useCartRefresh(): {
  refreshCartPrices: (overrideItems?: CartItem[]) => Promise<void>;
  isRefreshing: boolean;
  cartSummary: QuoteCartSummary | null;
} {
  const { items, updateItemPrice } = useCart();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cartSummary, setCartSummary] = useState<QuoteCartSummary | null>(null);

  const refreshCartPrices = useCallback(async (overrideItems?: CartItem[]) => {
    const toQuote = overrideItems ?? items;
    if (!toQuote.length) {
      setCartSummary(null);
      return;
    }

    setIsRefreshing(true);
    try {
      const lines: CartLine[] = toQuote.map((item) => {
        if (item.kind === "combo") {
          const comboItems = item.comboItems ?? [];
          const quoteItems: QuoteComboItem[] = [];

          const mainCI = comboItems.find((c) => c.isMain);
          if (mainCI?.productId) {
            quoteItems.push({
              productId: Number(mainCI.productId),
              quantity:  Number(mainCI.qty ?? 1),
              optionIds: (item.selectedOptions ?? [])
                .map((o) => Number(o.productOptionId))
                .filter((id) => Number.isFinite(id) && id > 0),
            });
          }
          for (const ci of comboItems.filter((c) => !c.isMain && !c.isInclusion)) {
            if (ci.productId) quoteItems.push({ productId: Number(ci.productId), quantity: Number(ci.qty ?? 1), optionIds: [] });
          }
          for (const ci of comboItems.filter((c) => !!c.isInclusion)) {
            if (ci.productId) quoteItems.push({ productId: Number(ci.productId), quantity: Number(ci.qty ?? 1), optionIds: [] });
          }

          return { type: "COMBO" as const, comboId: Number(item.id), qty: Number(item.quantity), items: quoteItems };
        } else {
          return {
            type: "PRODUCT" as const,
            productId: item.id,
            qty: item.quantity,
            optionIds: (item.selectedOptions ?? []).map((o) => o.productOptionId),
            comment: item.observations,
          };
        }
      });

      const { items: results, summary } = await quoteCart(lines);
      setCartSummary(summary);

      results.forEach((result, i) => {
        if (!result) return;
        const item = toQuote[i];
        if ((result as QuoteItemProductView).kind === "PRODUCT") {
          const r = result as QuoteItemProductView;
          const unit  = Number(r.unitFinalPrice);
          const total = Number(r.lineTotal);
          if (Number.isFinite(unit) && unit > 0) updateItemPrice(item.uniqueId, unit, Math.round(total));
        } else if ((result as QuoteItemComboView).kind === "COMBO") {
          const r = result as QuoteItemComboView;
          const eff = Number(r.breakdown.effectivePerCombo);
          if (Number.isFinite(eff) && eff > 0) updateItemPrice(item.uniqueId, eff, Math.round(eff * Number(item.quantity)));
        }
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [items, updateItemPrice]);

  return { refreshCartPrices, isRefreshing, cartSummary };
}
