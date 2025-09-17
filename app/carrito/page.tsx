// app/carrito/page.tsx
"use client";

import { useCart } from "@/components/cart-context";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

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
            {sortedItems.map((it: any) => {
              const comboData = it as MaybeCombo;
              const isCombo =
                comboData.kind === "combo" ||
                Array.isArray(comboData.comboItems);

              const main =
                comboData.comboItems?.find((x) => x.isMain) || undefined;
              const extras =
                comboData.comboItems?.filter((x) => !x.isMain) || [];

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

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{it.name}</div>
                      {isCombo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#fff5f2] border border-[#ea562f]/30 text-[#ea562f] font-semibold">
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
                        {extras.length > 0 && (
                          <div>
                            <span className="font-medium">Incluye:</span>
                            <ul className="list-disc pl-5">
                              {extras.map((e, idx) => (
                                <li key={idx}>
                                  {e.name || "Ítem"}
                                  {e.qty && e.qty > 1 ? ` x${e.qty}` : ""}
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

                  {/* Cantidad */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateQuantity(
                          it.uniqueId,
                          Math.max(1, Number(it.quantity) - 1)
                        )
                      }
                    >
                      −
                    </Button>
                    <div className="w-8 text-center font-semibold">
                      {it.quantity}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateQuantity(it.uniqueId, Number(it.quantity) + 1)
                      }
                    >
                      ＋
                    </Button>
                  </div>

                  {/* Precio y eliminar */}
                  <div className="w-24 text-right font-semibold">
                    {fmt(Number(it.finalPrice) || 0)}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => removeFromCart(it.uniqueId)}
                  >
                    Eliminar
                  </Button>
                </div>
              );
            })}

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Total:</div>
              <div className="text-xl font-extrabold text-[#ea562f]">
                {fmt(getTotalPrice())}
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="w-full" onClick={() => router.push("/checkout")}>
                Realizar Pedido
              </Button>
              <Button variant="outline" onClick={clearCart}>
                Vaciar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
