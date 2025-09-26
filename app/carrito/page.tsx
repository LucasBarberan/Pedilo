// app/carrito/page.tsx
"use client";

import { useCart } from "@/components/cart-context";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { STORE_OPEN, STORE_CLOSED_MSG } from "@/lib/flags";
import BlockingLoader from "@/components/blocking-loader"; // (no se usa ahora, lo podés quitar si querés)

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

// ranking de tamaños: triple -> doble -> simple
const SIZE_RANK: Record<string, number> = { triple: 0, doble: 1, simple: 2 };

// Tipo auxiliar para no romper si aún no agregaste los campos del combo al CartItem
type MaybeCombo = {
  kind?: string;
  comboName?: string;
  comboItems?: Array<{
    productId?: number;
    isMain?: boolean;
    qty?: number;
    name?: string;
    // 👇 NUEVO (para items que vienen de categorías incluidas)
    isInclusion?: boolean;
    inclusionTitle?: string;
    unitPrice?: number; // precio con regla aplicada
    basePrice?: number; // precio original
  }>;
  optionName?: string; // alias de size si lo preferís
};

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeFromCart, clearCart, getTotalPrice } =
    useCart();

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
    <div className="min-h-screen bg-background">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => {}} />
      <div className="h-[6px] w-full bg-white" />

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
                max-h-[60vh]            /* móvil */
                md:max-h-[65vh]         /* desktop */
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
                      <div className="flex items-start gap-2">
                        {/* nombre SIN truncate: permite varias líneas */}
                        <div className="font-semibold leading-tight whitespace-normal break-words">
                          {it.name}
                        </div>
                        {isCombo && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fff5f2] border border-[var(--brand-color)]/30 text-[var(--brand-color)] font-semibold">
                            COMBO
                          </span>
                        )}
                      </div>

                      {/* Detalles producto suelto */}
                      {!isCombo && sizeLabel && (
                        <div className="text-xs text-muted-foreground">
                          Tamaño: {sizeLabel}
                        </div>
                      )}
                      {!isCombo && it.observations && (
                        <div className="text-xs text-muted-foreground">
                          Obs: {it.observations}
                        </div>
                      )}

                      {/* Detalles combo */}
                      {isCombo && (
                        <div className="mt-1 text-xs text-muted-foreground space-y-1">
                          {main && (
                            <div>
                              <span className="font-medium">Principal:</span>{" "}
                              {main.name || "Producto"}
                              {sizeLabel ? ` · Tamaño: ${sizeLabel}` : ""}
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
                                    {/* precios si están disponibles */}
                                    {typeof ci.unitPrice === "number" ? (
                                      <>
                                        {" "}
                                        {typeof ci.basePrice === "number" &&
                                        ci.basePrice !== ci.unitPrice ? (
                                          <>
                                            <span className="line-through opacity-50 mr-1">
                                              {fmt(ci.basePrice)}
                                            </span>
                                            <span className="font-medium">
                                              {fmt(ci.unitPrice)}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="font-medium">
                                            {fmt(ci.unitPrice)}
                                          </span>
                                        )}
                                      </>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {it.observations && (
                            <div>Obs: {String(it.observations)}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Derecha: qty arriba, precio + X abajo (mobile); horizontal en desktop */}
                    <div
                      className="ml-auto w-28 sm:w-auto flex flex-col items-end gap-2 shrink-0
                                  sm:flex-row sm:items-center sm:gap-3"
                    >
                      {/* Cantidad (arriba en mobile) */}
                      <div className="flex items-center gap-2 order-1 sm:order-none">
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
                          onClick={() =>
                            updateQuantity(
                              it.uniqueId,
                              Number(it.quantity) + 1
                            )
                          }
                        >
                          ＋
                        </Button>
                      </div>

                      {/* Precio (sin botón eliminar) */}
                      <div className="text-right font-semibold shrink-0 w-20 sm:w-24 order-2 sm:order-none">
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
                  className={`flex-1 text-white transition-colors
                              bg-[var(--brand-color)]
                              hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                              active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                              hover:brightness-95 active:brightness-90
                              disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
                              ${!STORE_OPEN ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
                  onClick={() => router.push("/checkout")}
                >
                  Realizar Pedido
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
