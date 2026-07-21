// app/carrito/page.tsx
"use client";

import { useCart } from "@/components/cart-context";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useEffect } from "react";
import { useCartRefresh } from "@/hooks/useCartRefresh";
import { Trash2 } from "lucide-react";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import { useOnlineConfig } from "@/lib/hooks/useOnlineConfig";
import { fixImageUrl } from "@/lib/img";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

// ranking de tamaños: triple -> doble -> simple
const SIZE_RANK: Record<string, number> = { triple: 0, doble: 1, simple: 2 };

// Tipo auxiliar para combos en items del carrito
type MaybeCombo = {
  kind?: string;
  comboName?: string;
  comboItems?: Array<{
    productId?: number;
    isMain?: boolean;
    qty?: number;
    name?: string;
    isInclusion?: boolean;
    inclusionTitle?: string;
    unitPrice?: number; // precio con regla aplicada
    basePrice?: number; // precio original
  }>;
  optionName?: string;
};

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, updateItemPrice, removeFromCart, clearCart, getTotalPrice } =
    useCart();
  const { refreshCartPrices, isRefreshing, cartSummary } = useCartRefresh();

  useEffect(() => {
    refreshCartPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIncrease = async (it: any) => {
    const newQty = Number(it.quantity) + 1;
    updateQuantity(it.uniqueId, newQty);
    const updatedItems = items.map((item: any) =>
      item.uniqueId === it.uniqueId ? { ...item, quantity: newQty } : item
    );
    await refreshCartPrices(updatedItems as any);
  };

  const handleDecrease = async (it: any) => {
    const q = Number(it.quantity) || 0;
    if (q <= 1) {
      removeFromCart(it.uniqueId);
      return;
    }
    const newQty = q - 1;
    updateQuantity(it.uniqueId, newQty);
    const updatedItems = items.map((item: any) =>
      item.uniqueId === it.uniqueId ? { ...item, quantity: newQty } : item
    );
    await refreshCartPrices(updatedItems as any);
  };

  // === Estado comercial (igual que en producto/combos) ===
  const { data: status } = useBusinessStatusSmart();
  const { config: onlineConfig } = useOnlineConfig();
  const isWebOpen  = status?.web?.open ?? true;                       // mientras carga, asumimos abierto
  const pickupOnly = !!(status?.pos?.open && status?.web?.open === false);
  const disabledByStatus = !isWebOpen;

  // Ordenar ítems según regla pedida
  const sortedItems = useMemo(() => {
    return [...items].sort((a: any, b: any) => {
      // 1) categorías default primero
      const da = a.isDefaultCategory ? 0 : 1;
      const db = b.isDefaultCategory ? 0 : 1;
      if (da !== db) return da - db;

      // 2) tamaño: triple -> doble -> simple (los que no tienen, al final)
      const ra =
        SIZE_RANK[String((a.size || a.optionName || "").toLowerCase())] ?? 99;
      const rb =
        SIZE_RANK[String((b.size || b.optionName || "").toLowerCase())] ?? 99;
      if (ra !== rb) return ra - rb;

      // 3) desempate por nombre
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);

  return (
    <div className="bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => {}} />

      {/* Banners de estado (opcional pero consistente con las otras pantallas) */}
      <ClosedBanner />
      <InfoBanner />

      <div className="mx-auto w-full max-w-4xl p-4 space-y-4">
        <h2 className="text-xl font-extrabold uppercase">Mi Carrito</h2>

        {sortedItems.length === 0 ? (
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
            Tu carrito está vacío.
          </div>
        ) : (
          <>
            {/* === LISTA CON SCROLL === */}
            <div
              className="
                space-y-3
                overflow-y-auto
                pr-1
                max-h-[60vh]
                md:max-h-[65vh]
              "
              role="list"
              aria-label="Ítems del carrito"
            >
              {sortedItems.map((it: any) => {
                const comboData = it as MaybeCombo;
                const isCombo =
                  comboData.kind === "combo" ||
                  Array.isArray(comboData.comboItems);

                const main =
                  comboData.comboItems?.find((x) => x.isMain) || undefined;
                const fixedExtras =
                  comboData.comboItems?.filter(
                    (x) => !x.isMain && !x.isInclusion
                  ) || [];

                const inclusionsChosen =
                  comboData.comboItems?.filter((x) => x.isInclusion) || [];

                const sizeLabel =
                  (it.size as string) ||
                  (comboData.optionName as string) ||
                  undefined;

                return (
                  <div
                    key={it.uniqueId}
                    className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 flex items-start gap-3"
                  >
                    {/* Imagen */}
                    <div className="relative w-14 h-14 overflow-hidden rounded-md bg-black/5 flex-shrink-0">
                      <Image
                        src={fixImageUrl(it.image) || "/placeholder.svg"}
                        alt={it.name}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Texto / detalles */}
                    <div className="flex-1 min-w-0">
                      {/* PRODUCTO SIMPLE */}
                      {!isCombo && (
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-gray-900 leading-snug whitespace-normal break-words">
                            {it.name}
                          </p>
                          {it.selectedOptions && it.selectedOptions.length > 0 ? (
                            <p className="text-xs text-gray-500">
                              {it.selectedOptions.map((opt: any) => opt.optionName).join(" + ")}
                            </p>
                          ) : sizeLabel && (
                            <p className="text-xs text-gray-500">{sizeLabel}</p>
                          )}
                          {it.observations?.trim() && (
                            <p className="text-xs text-gray-400 italic">Obs: {it.observations}</p>
                          )}
                        </div>
                      )}

                      {/* COMBO */}
                      {isCombo && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 leading-snug whitespace-normal break-words">
                              {it.name}
                            </p>
                            <span
                              className="inline-flex items-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full border leading-none shrink-0"
                              style={{
                                backgroundColor: "color-mix(in srgb, var(--brand-color) 10%, white)",
                                borderColor: "color-mix(in srgb, var(--brand-color) 30%, transparent)",
                                color: "var(--brand-color)"
                              }}
                            >
                              COMBO
                            </span>
                          </div>
                          {/* Slots: cada comboItem con sus opciones */}
                          {(comboData.comboItems?.filter((x) => !x.isInclusion) ?? []).length > 0 && (
                            <div
                              className="pl-2 border-l-2 space-y-1"
                              style={{ borderColor: "color-mix(in srgb, var(--brand-color) 35%, transparent)" }}
                            >
                              {(comboData.comboItems?.filter((x) => !x.isInclusion) ?? []).map((ci: any, idx: number) => {
                                const opts: string[] = Array.isArray(ci.selectedOptions)
                                  ? ci.selectedOptions.map((o: any) => o.optionName).filter(Boolean)
                                  : [];
                                // Para el item principal legacy, también leer it.selectedOptions
                                const legacyOpts: string[] = ci.isMain && it.selectedOptions?.length > 0 && opts.length === 0
                                  ? it.selectedOptions.map((o: any) => o.optionName).filter(Boolean)
                                  : [];
                                const allOpts = opts.length > 0 ? opts : legacyOpts;

                                return (
                                  <div key={idx} className="space-y-0.5">
                                    <p className="text-xs text-gray-600 leading-snug">
                                      {ci.qty && ci.qty > 1 ? `${ci.qty}x ` : ""}{ci.name || "Producto"}
                                    </p>
                                    {allOpts.length > 0 && (
                                      <p className="text-xs text-gray-400">
                                        {allOpts.join(" · ")}
                                      </p>
                                    )}
                                    {ci.comment?.trim() && (
                                      <p className="text-xs text-gray-400 italic">"{ci.comment}"</p>
                                    )}
                                  </div>
                                );
                              })}
                              {inclusionsChosen.length > 0 && (
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
                                  {inclusionsChosen.map((ci, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                                      {ci.name}
                                      {typeof ci.unitPrice === "number" && (
                                        <span className="ml-0.5">
                                          {typeof ci.basePrice === "number" && ci.basePrice !== ci.unitPrice ? (
                                            <>
                                              <span className="line-through opacity-50 mr-0.5">{fmt(ci.basePrice)}</span>
                                              <span className="font-medium">{fmt(ci.unitPrice)}</span>
                                            </>
                                          ) : (
                                            <span className="font-medium">{fmt(ci.unitPrice)}</span>
                                          )}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {it.observations?.trim() && (
                            <p className="text-xs text-gray-400 italic pl-2">Obs: {String(it.observations)}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Columna derecha */}
                    <div
                      className="
                        ml-auto shrink-0
                        flex flex-col items-end gap-1 w-24 sm:w-28
                        md:w-auto md:flex-row md:items-center md:gap-3
                      "
                    >
                      {/* Controles de cantidad */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                          onClick={() => handleDecrease(it)}
                          aria-label="Restar"
                        >
                          −
                        </Button>

                        <div className="w-7 sm:w-8 text-center font-semibold text-sm sm:text-base">
                          {it.quantity}
                        </div>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                          onClick={() => handleIncrease(it)}
                          aria-label="Sumar"
                        >
                          ＋
                        </Button>
                      </div>

                      {/* Precio */}
                      <div
                        className="
                          text-right font-semibold
                          w-full md:w-auto md:min-w-[6rem]
                        "
                      >
                        {fmt(Number(it.finalPrice) || 0)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* === FOOTER PEGADO ABAJO === */}
            <div
              className="
                sticky bottom-0
                bg-background/95
                backdrop-blur
                supports-[backdrop-filter]:bg-background/80
                pt-3 space-y-3
              "
            >
              <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
                {isRefreshing ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Total:</span>
                    <span className="text-sm font-normal text-gray-400 animate-pulse">Actualizando...</span>
                  </div>
                ) : (
                  <div className="w-full space-y-2">
                    {cartSummary && (
                      <>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Subtotal</span>
                          <span>{fmt(cartSummary.originalSubtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm" style={{ color: "var(--brand-color)" }}>
                          <span className="font-medium truncate pr-2">{cartSummary.promoName ?? "Descuento promo"}</span>
                          <span className="font-semibold shrink-0">−{fmt(cartSummary.savings)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Total:</span>
                      <span className="text-xl font-extrabold text-[var(--brand-color)]">{fmt(cartSummary?.total ?? getTotalPrice())}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 flex-nowrap pb-1">
                <Button
                  className="flex-1 text-white transition-colors
                             bg-[var(--brand-color)]
                             hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                             active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                             hover:brightness-95 active:brightness-90
                             disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none"
                  onClick={isWebOpen ? () => router.push("/checkout") : undefined}
                  disabled={disabledByStatus}
                  title={
                    disabledByStatus
                      ? (pickupOnly ? "Solo tomamos pedidos en el local." : onlineConfig.closedMessage)
                      : undefined
                  }
                  aria-disabled={disabledByStatus}
                >
                  {disabledByStatus
                    ? (pickupOnly ? "Solo en el local" : "Local cerrado")
                    : "Realizar Pedido"}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearCart}
                  aria-label="Vaciar carrito"
                  title="Vaciar carrito"
                >
                  <Trash2 className="h-5 w-5" />
                  <span className="sr-only">Vaciar</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
