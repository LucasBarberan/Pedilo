// app/carrito/page.tsx
"use client";

import { useCart } from "@/components/cart-context";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import { STORE_CLOSED_MSG } from "@/lib/flags";
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
  const { items, updateQuantity, removeFromCart, clearCart, getTotalPrice } =
    useCart();

  // === Estado comercial (igual que en producto/combos) ===
  const { data: status } = useBusinessStatusSmart();
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
      <div className="h-[6px] w-full bg-white" />

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
                        src={it.image?.trim() ? it.image : "/placeholder.svg"}
                        alt={it.name}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Texto / detalles */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold leading-tight whitespace-normal break-words">
                        {it.name}
                      </div>

                      {/* Detalles producto suelto */}
                      {!isCombo && (
                        <>
                          {/* Mostrar opciones seleccionadas (nuevo formato) */}
                          {it.selectedOptions && it.selectedOptions.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {it.selectedOptions.map((opt: any, idx: number) => (
                                <span key={idx}>
                                  {opt.optionName}
                                  {opt.priceExtra > 0 && ` (+$${opt.priceExtra.toLocaleString()})`}
                                  {idx < it.selectedOptions.length - 1 && " + "}
                                </span>
                              ))}
                            </div>
                          ) : (
                            /* Fallback legacy */
                            sizeLabel && (
                              <div className="text-xs text-muted-foreground">Tamaño: {sizeLabel}</div>
                            )
                          )}
                          {it.observations && (
                            <div className="text-xs text-muted-foreground">Obs: {it.observations}</div>
                          )}
                        </>
                      )}

                      {/* Detalles combo */}
                      {isCombo && (
                        <div className="mt-1 text-xs text-muted-foreground space-y-1">
                          {main && (
                            <div>
                              <span className="font-medium">Principal:</span>{" "}
                              {main.name || "Producto"}
                              {/* Mostrar opciones del combo (nuevo formato) */}
                              {it.selectedOptions && it.selectedOptions.length > 0 ? (
                                <span>
                                  {" · "}
                                  {it.selectedOptions.map((opt: any, idx: number) => (
                                    <span key={idx}>
                                      {opt.optionName}
                                      {idx < it.selectedOptions.length - 1 && " + "}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                sizeLabel && ` · Tamaño: ${sizeLabel}`
                              )}
                              {main.qty && main.qty > 1 ? ` x${main.qty}` : ""}
                            </div>
                          )}

                          {fixedExtras.length > 0 && (
                            <div>
                              <span className="font-medium">Incluye:</span>
                              <ul className="list-disc pl-5">
                                {fixedExtras.map((e, idx) => (
                                  <li key={idx}>
                                    {e.name || "Ítem"}
                                    {e.qty && e.qty > 1 ? ` x${e.qty}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {inclusionsChosen.length > 0 && (
                            <div>
                              <span className="font-medium">Elegiste:</span>
                              <ul className="list-disc pl-5">
                                {inclusionsChosen.map((ci, idx) => (
                                  <li key={idx}>
                                    <span>{ci.name}</span>
                                    {typeof ci.unitPrice === "number" ? (
                                      <>
                                        {" "}
                                        {typeof ci.basePrice === "number" && ci.basePrice !== ci.unitPrice ? (
                                          <>
                                            <span className="line-through opacity-50 mr-1">
                                              {fmt(ci.basePrice)}
                                            </span>
                                            <span className="font-medium">{fmt(ci.unitPrice)}</span>
                                          </>
                                        ) : (
                                          <span className="font-medium">{fmt(ci.unitPrice)}</span>
                                        )}
                                      </>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {it.observations && <div>Obs: {String(it.observations)}</div>}
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
                      {isCombo && (
                        <span
                          className="
                            self-end md:self-auto
                            text-[10px] px-2 py-0.5 rounded-full
                            bg-[#fff5f2] border border-[var(--brand-color)]/30 text-[var(--brand-color)]
                            font-semibold
                          "
                        >
                          COMBO
                        </span>
                      )}

                      {/* Controles de cantidad */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                          onClick={() => {
                            const q = Number(it.quantity) || 0;
                            if (q <= 1) {
                              removeFromCart(it.uniqueId);
                            } else {
                              updateQuantity(it.uniqueId, q - 1);
                            }
                          }}
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
                          onClick={() => updateQuantity(it.uniqueId, Number(it.quantity) + 1)}
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
              <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4 flex items-center justify-between">
                <div className="text-sm font-semibold">Total:</div>
                <div className="text-xl font-extrabold text-[var(--brand-color)]">
                  {fmt(getTotalPrice())}
                </div>
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
                      ? (pickupOnly ? "Solo tomamos pedidos en el local." : STORE_CLOSED_MSG)
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
