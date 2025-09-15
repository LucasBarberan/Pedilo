// app/producto/[id]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart-context";
import { Button } from "@/components/ui/button";

type ProductOption = {
  id: string | number;
  precio_extra?: number | string | null; // acepta string (Decimal)
  option?: { id: string | number; name: string };
  isDefault?: boolean;
};

type Product = {
  id: string | number;
  name: string;
  description?: string;
  price?: number | string; // acepta string (Decimal)
  imageUrl?: string;
  productOptions?: ProductOption[];
  category?: { isDefault?: boolean };   // 👈 NUEVO
};

// helpers
const fmt = (n?: number | string) => {
  const v = typeof n === "string" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("es-AR")}`
    : "-";
};
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

// orden por nombre: simple -> doble -> triple (tolerante a acentos/mayúsculas)
const normalize = (s?: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

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

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [justAdded, setJustAdded] = useState(false);
  const [prod, setProd] = useState<Product | null>(null);
  const [selectedOptId, setSelectedOptId] = useState<string | number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL;
    if (!id || !BASE) return;

    (async () => {
      setLoading(true);
      const res = await fetch(`${BASE}/products/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setProd(null);
        setLoading(false);
        return;
      }

      const raw = await res.json();
      const product: Product =
        raw && raw.data && !Array.isArray(raw.data)
          ? raw.data
          : raw && raw.data && raw.data?.data && !Array.isArray(raw.data.data)
          ? raw.data.data
          : raw;

      // ✅ ordenar opciones apenas llega
      const ordered =
        product.productOptions?.length
          ? [...product.productOptions].sort(optionSorter)
          : [];

      const productOrdered: Product = { ...product, productOptions: ordered };
      setProd(productOrdered || null);

      // ✅ preselección: default si hay; sino primera por orden
      const def = ordered.find(o => o.isDefault);
      setSelectedOptId((def ?? ordered[0])?.id ?? null);

      setLoading(false);
    })().catch(() => {
      setProd(null);
      setLoading(false);
    });
  }, [id]);

  // opción seleccionada
  const selectedOption = useMemo(() => {
    if (!prod?.productOptions?.length) return undefined;
    return prod.productOptions.find((o) => o.id === selectedOptId);
  }, [prod, selectedOptId]);

  // Totales (precio puede venir como string)
  const base = toNum(prod?.price);
  const extra = toNum(selectedOption?.precio_extra);
  const total = (base + extra) * qty;

  const handleAdd = () => {
    const base =
      typeof prod?.price === "string" ? Number(prod?.price) : (prod?.price ?? 0);
    const extra =
      typeof selectedOption?.precio_extra === "string"
        ? Number(selectedOption?.precio_extra)
        : (selectedOption?.precio_extra ?? 0);

    addToCart({
      uniqueId: `${prod?.id}-${selectedOptId}-${Date.now()}`,
      id: Number(prod?.id) || 0,
      name: prod?.name || "",
      description: prod?.description || "",
      price: base + extra,
      finalPrice: (base + extra) * qty,
      image: prod?.imageUrl || "",
      category: "",
      quantity: qty,

      // info “visual”
      size: selectedOption?.option?.name?.toLowerCase() as any,
      observations: notes,

      // 👉 el que usa el backend para option_ids
      productOptionId: Number(selectedOption?.id) || undefined,

      // opcional/visual
      optionId: Number(selectedOption?.option?.id) || undefined,
      optionName: selectedOption?.option?.name || undefined,
      priceExtra: extra,
      isDefaultCategory: !!prod?.category?.isDefault,
    });

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
    setNotes("");
    setQty(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader
          showBack
          onBack={() => router.back()}
          onCartClick={() => router.push("/carrito")}
        />
        <div className="h-[6px] w-full bg-white" />
        <div className="mx-auto w-full max-w-6xl p-4">Cargando…</div>
      </div>
    );
  }

  if (!prod) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader
          showBack
          onBack={() => router.back()}
          onCartClick={() => router.push("/carrito")}
        />
        <div className="h-[6px] w-full bg-white" />
        <div className="mx-auto w-full max-w-6xl p-4">No se encontró el producto.</div>
      </div>
    );
  }

  const hasOptions = Array.isArray(prod.productOptions) && prod.productOptions.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />

      <div className="mx-auto w-full max-w-6xl p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Izquierda: imagen + nombre + descripción */}
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 bg-white/60">
            <div className="relative w-full aspect-[4/3]">
              <Image
                src={prod.imageUrl && prod.imageUrl.trim() ? prod.imageUrl : "/placeholder.svg"}
                alt={prod.name}
                fill
                className="object-cover"
              />
            </div>
          </div>

          <h2 className="text-xl font-extrabold uppercase">{prod.name}</h2>

          {prod.description && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 text-sm text-muted-foreground">
              {prod.description}
            </div>
          )}
        </div>

        {/* Derecha: opciones (si hay) + cantidad + obs + total */}
        <div className="space-y-4">
          {hasOptions && (
            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3 space-y-2">
              <div className="text-sm font-semibold mb-2">Tamaño:</div>
              {prod.productOptions!.map((o) => {
                const active = selectedOptId === o.id;
                const plus = toNum(o.precio_extra);
                return (
                  <button
                    key={String(o.id)}
                    onClick={() => setSelectedOptId(o.id)}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between",
                      active ? "border-[#ea562f] bg-[#fff5f2]" : "border-transparent hover:bg-black/5",
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
              <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </Button>
              <div className="w-8 text-center font-semibold">{qty}</div>
              <Button variant="outline" onClick={() => setQty((q) => q + 1)}>
                ＋
              </Button>
            </div>
          </div>

          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="text-sm font-semibold mb-2">Observaciones:</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Escribe aquí cualquier observación especial para tu pedido..."
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ea562f]"
            />
          </div>

          <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Total:</div>
              <div className="text-xl font-extrabold text-[#ea562f]">{fmt(total)}</div>
            </div>
            <Button className="w-full" onClick={handleAdd}>
              {justAdded ? "Agregado ✔" : "Agregar al Carrito"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
