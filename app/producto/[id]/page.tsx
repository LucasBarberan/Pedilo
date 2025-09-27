// app/producto/[id]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import ClosedBanner from "@/components/closed-banner";
import { STORE_OPEN, STORE_CLOSED_MSG } from "@/lib/flags";
import BlockingLoader from "@/components/blocking-loader";
import { fixImageUrl } from "@/lib/img";

type ProductOption = {
  id: string | number;
  precio_extra?: number | string | null;
  option?: { id: string | number; name: string };
  isDefault?: boolean;
};

type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number | string;
  imageUrl?: string;
  productOptions?: ProductOption[];
  category?: { isDefault?: boolean };
};

const MAX_NOTES = 50;
const fmt = (n?: number | string) => {
  const v = typeof n === "string" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toLocaleString("es-AR")}` : "-";
};
const toNum = (v: unknown) => (typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0);

const normalize = (s?: string) =>
  (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const rankByName = (o: ProductOption) => {
  const n = normalize(o.option?.name);
  if (n.includes("simple")) return 0;
  if (n.includes("doble")) return 1;
  if (n.includes("triple")) return 2;
  return 99;
};
const optionSorter = (a: ProductOption, b: ProductOption) => {
  const ra = rankByName(a);
  const rb = rankByName(b);
  if (ra !== rb) return ra - rb;
  if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
  const ea = Number(a.precio_extra || 0);
  const eb = Number(b.precio_extra || 0);
  return ea - eb;
};

// ------- Warm cache helpers (sessionStorage) -------
const warmKey = (id: string | number) => `prefetch:product:${id}`;
function readWarmProduct(id: string | number): Product | null {
  try {
    const raw = sessionStorage.getItem(warmKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    // defensivo: dejamos solo lo básico
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price: p.price,
      imageUrl: p.imageUrl,
      productOptions: Array.isArray(p.productOptions) ? p.productOptions : [],
      category: p.category,
    } as Product;
  } catch {
    return null;
  }
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [justAdded, setJustAdded] = useState(false);

  // 1) Si hay preview en sessionStorage lo uso para pintar YA
  const warmOnce = useRef<Product | null>(null);
  if (!warmOnce.current && id) {
    warmOnce.current = readWarmProduct(id);
  }

  const [prod, setProd] = useState<Product | null>(warmOnce.current);
  const [selectedOptId, setSelectedOptId] = useState<string | number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(!warmOnce.current); // si tengo warm, no muestro overlay

  // Cuando llega el producto (warm o fetch), elegir opción por defecto
  useEffect(() => {
    if (!prod?.productOptions?.length) return;
    const ordered = [...prod.productOptions].sort(optionSorter);
    const def = ordered.find((o) => o.isDefault) ?? ordered[0];
    setSelectedOptId(def?.id ?? null);
    // actualizo prod con el orden aplicado (mejora UX si vino warm sin ordenar)
    setProd((p) => (p ? { ...p, productOptions: ordered } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.id]); // solo cuando cambia de producto

  // 2) Fetch real (reemplaza el warm en cuanto llega)
  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!id || !BASE) return;

    let aborted = false;
    (async () => {
      try {
        setLoading(!warmOnce.current); // si no había warm, muestro overlay; si había, no
        const res = await fetch(`${BASE}/products/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("not ok");

        const raw = await res.json();
        const product: Product =
          raw?.data && !Array.isArray(raw.data)
            ? raw.data
            : raw?.data?.data && !Array.isArray(raw.data.data)
            ? raw.data.data
            : raw;

        const ordered = product.productOptions?.length
          ? [...product.productOptions].sort(optionSorter)
          : [];

        const productOrdered: Product = { ...product, productOptions: ordered };
        if (!aborted) setProd(productOrdered || null);
        // refresco el warm para futuras navegaciones “atrás/adelante”
        try {
          sessionStorage.setItem(
            warmKey(productOrdered.id),
            JSON.stringify(productOrdered)
          );
        } catch {}
      } catch {
        if (!aborted) setProd((p) => p ?? null); // si falló, mantené warm
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [id]);

  const selectedOption = useMemo(() => {
    if (!prod?.productOptions?.length) return undefined;
    return prod.productOptions.find((o) => o.id === selectedOptId);
  }, [prod, selectedOptId]);

  const base = toNum(prod?.price);
  const extra = toNum(selectedOption?.precio_extra);
  const total = (base + extra) * qty;

  const handleAdd = () => {
    if (!prod) return;
    const baseNum = typeof prod.price === "string" ? Number(prod.price) : (prod.price ?? 0);
    const extraNum =
      typeof selectedOption?.precio_extra === "string"
        ? Number(selectedOption?.precio_extra)
        : (selectedOption?.precio_extra ?? 0);

    addToCart({
      uniqueId: `${prod.id}-${selectedOptId}-${Date.now()}`,
      id: Number(prod.id) || 0,
      name: prod.name || "",
      description: prod.description || "",
      price: baseNum + extraNum,
      finalPrice: (baseNum + extraNum) * qty,
      image: prod.imageUrl || "",
      category: "",
      quantity: qty,
      size: selectedOption?.option?.name?.toLowerCase() as any,
      observations: notes,
      productOptionId: Number(selectedOption?.id) || undefined,
      optionId: Number(selectedOption?.option?.id) || undefined,
      optionName: selectedOption?.option?.name || undefined,
      priceExtra: extraNum,
      isDefaultCategory: !!prod?.category?.isDefault,
    });

    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      router.back();
    }, 600);
    setNotes("");
    setQty(1);
  };

  // ⬇️ Render SIEMPRE; overlay solo si no hubo warm
  return (
    <div className="min-h-screen bg-background relative">
      <SiteHeader showBack onBack={() => router.back()} onCartClick={() => router.push("/carrito")} />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />

      {!prod && !loading ? (
        <div className="mx-auto w-full max-w-6xl p-4">No se encontró el producto.</div>
      ) : (
        <div className="mx-auto w-full max-w-6xl p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Izquierda */}
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={fixImageUrl(prod?.imageUrl) || "/placeholder.svg"}
                  alt={prod?.name || "Producto"}
                  fill
                  className="object-cover"
                  priority // 👈 prioriza descarga del hero
                />
              </div>
            </div>

            <h2 className="text-xl font-extrabold uppercase">{prod?.name ?? "…"}</h2>

            {prod?.description && (
              <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 text-sm text-muted-foreground">
                {prod.description}
              </div>
            )}
          </div>

          {/* Derecha */}
          <div className="space-y-4">
            {!!prod?.productOptions?.length && (
              <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 space-y-2">
                <div className="text-sm font-semibold mb-2">Tamaño:</div>
                {prod.productOptions.map((o) => {
                  const active = selectedOptId === o.id;
                  const plus = toNum(o.precio_extra);
                  return (
                    <button
                      key={String(o.id)}
                      onClick={() => setSelectedOptId(o.id)}
                      disabled={loading && !prod} // durante overlay real
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between",
                        active ? "border-[var(--brand-color)] bg-[#fff5f2]" : "border-transparent hover:bg-black/5",
                      ].join(" ")}
                    >
                      <span className="text-sm">{o.option?.name || "Opción"}</span>
                      <span className="text-sm font-semibold">{plus ? `+${fmt(plus)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Cantidad:</div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={loading && !prod}>
                  −
                </Button>
                <div className="w-8 text-center font-semibold">{qty}</div>
                <Button variant="outline" onClick={() => setQty((q) => q + 1)} disabled={loading && !prod}>
                  ＋
                </Button>
              </div>
            </div>

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Observaciones:</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
                maxLength={MAX_NOTES}
                rows={2}
                placeholder="Escribe aquí cualquier observación especial para tu pedido..."
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-color)] resize-none min-h-[40px]"
                onInput={(e) => {
                  const ta = e.currentTarget;
                  ta.style.height = "auto";
                  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                }}
                disabled={loading && !prod}
              />
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {notes.length}/{MAX_NOTES}
              </div>
            </div>

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Total:</div>
                <div className="text-xl font-extrabold text-[var(--brand-color)]">{fmt(total)}</div>
              </div>
              <Button
                className={`w-full text-white transition-colors
                  bg-[var(--brand-color)]
                  hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                  active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                  hover:brightness-95 active:brightness-90
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
                  ${!STORE_OPEN ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
                onClick={STORE_OPEN ? handleAdd : undefined}
                disabled={!STORE_OPEN || (loading && !prod)}
                title={!STORE_OPEN ? STORE_CLOSED_MSG : undefined}
                aria-disabled={!STORE_OPEN || (loading && !prod)}
              >
                {!STORE_OPEN ? "Local cerrado" : justAdded ? "Agregado ✔" : "Agregar al Carrito"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Overlay bloqueante solo si no teníamos warm */}
      <BlockingLoader open={loading && !warmOnce.current} message="Cargando producto…" />
    </div>
  );
}
