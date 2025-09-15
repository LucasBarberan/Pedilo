// app/carrito/page.tsx
"use client";

import { useCart } from "@/components/cart-context";
import SiteHeader from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo } from "react"; // 👈 NUEVO

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

// ranking de tamaños: triple -> doble -> simple
const SIZE_RANK: Record<string, number> = { triple: 0, doble: 1, simple: 2 };

export default function CartPage() {
  const router = useRouter();
  const {
    items,
    updateQuantity,
    removeFromCart,
    clearCart,
    getTotalPrice,
  } = useCart();

  // 👇 Ordenar ítems según regla pedida
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // 1) categorías default primero
      const da = a.isDefaultCategory ? 0 : 1;
      const db = b.isDefaultCategory ? 0 : 1;
      if (da !== db) return da - db;

      // 2) tamaño: triple -> doble -> simple (los que no tienen, al final)
      const ra = SIZE_RANK[String(a.size || "").toLowerCase()] ?? 99;
      const rb = SIZE_RANK[String(b.size || "").toLowerCase()] ?? 99;
      if (ra !== rb) return ra - rb;

      // 3) desempate opcional por nombre
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [items]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => {}}
      />
      <div className="h-[6px] w-full bg-white" />

      <div className="mx-auto w-full max-w-4xl p-4 space-y-4">
        <h2 className="text-xl font-extrabold uppercase">Mi Carrito</h2>

        {sortedItems.length === 0 ? (  // 👈 usar sortedItems
          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-4">
            Tu carrito está vacío.
          </div>
        ) : (
          <>
            {sortedItems.map((it) => (  // 👈 usar sortedItems
              <div
                key={it.uniqueId}
                className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 flex items-center gap-3"
              >
                <div className="relative w-14 h-14 overflow-hidden rounded-md bg-black/5">
                  <Image
                    src={it.image?.trim() ? it.image : "/placeholder.svg"}
                    alt={it.name}
                    fill
                    className="object-cover"
                  />
                </div>

                <div className="flex-1">
                  <div className="font-semibold">{it.name}</div>
                  {it.size && (
                    <div className="text-xs text-muted-foreground">
                      Tamaño: {it.size}
                    </div>
                  )}
                  {it.observations && (
                    <div className="text-xs text-muted-foreground">
                      Obs: {it.observations}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateQuantity(it.uniqueId, Math.max(1, it.quantity - 1))
                    }
                  >
                    −
                  </Button>
                  <div className="w-8 text-center font-semibold">{it.quantity}</div>
                  <Button
                    variant="outline"
                    onClick={() => updateQuantity(it.uniqueId, it.quantity + 1)}
                  >
                    ＋
                  </Button>
                </div>

                <div className="w-24 text-right font-semibold">
                  {fmt(it.finalPrice)}
                </div>

                <Button
                  variant="outline"
                  onClick={() => removeFromCart(it.uniqueId)}
                >
                  Eliminar
                </Button>
              </div>
            ))}

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
