"use client";

import { useState, useCallback } from "react";
import { useCart, type CartItem } from "@/components/cart-context";
import { quoteCart, type QuotePaymentAdjustment, type QuoteCartSummary, type QuoteItemProductView, type QuoteItemComboView } from "@/lib/pricing";
import { buildOrderLines } from "@/lib/orderLines";

export function useCartRefresh(): {
  refreshCartPrices: (overrideItems?: CartItem[]) => Promise<void>;
  isRefreshing: boolean;
  cartSummary: QuoteCartSummary | null;
  /** Descuento/recargo del medio de pago según el Backend (fuente de verdad, ya redondeado); null hasta cotizarlo. */
  paymentQuote: (QuotePaymentAdjustment & { paymentMethodId: number }) | null;
  refreshPaymentQuote: (opts: {
    paymentMethodId: number | null;
    loyaltyCustomerId?: number | null;
    loyaltyPointsToRedeem?: number | null;
  }) => Promise<void>;
} {
  const { items, updateItemPrice } = useCart();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cartSummary, setCartSummary] = useState<QuoteCartSummary | null>(null);
  const [paymentQuote, setPaymentQuote] = useState<(QuotePaymentAdjustment & { paymentMethodId: number }) | null>(null);

  // Cotiza el carrito ACTUAL con el medio de pago elegido: el Backend devuelve el descuento/recargo ya redondeado
  // (priceRoundingStep), así que el checkout muestra exactamente lo que se va a cobrar.
  const refreshPaymentQuote = useCallback(
    async ({
      paymentMethodId,
      loyaltyCustomerId,
      loyaltyPointsToRedeem,
    }: {
      paymentMethodId: number | null;
      loyaltyCustomerId?: number | null;
      loyaltyPointsToRedeem?: number | null;
    }) => {
      if (paymentMethodId == null || !items.length) {
        setPaymentQuote(null);
        return;
      }
      const { payment } = await quoteCart(buildOrderLines(items), { paymentMethodId, loyaltyCustomerId, loyaltyPointsToRedeem });
      setPaymentQuote(payment ? { ...payment, paymentMethodId } : null);
    },
    [items]
  );

  const refreshCartPrices = useCallback(async (overrideItems?: CartItem[]) => {
    const toQuote = overrideItems ?? items;
    if (!toQuote.length) {
      setCartSummary(null);
      return;
    }

    setIsRefreshing(true);
    try {
      const lines = buildOrderLines(toQuote);

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

  return { refreshCartPrices, isRefreshing, cartSummary, paymentQuote, refreshPaymentQuote };
}
