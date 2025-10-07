// app/producto/[id]/page.tsx
"use client";

import SiteHeader from "@/components/site-header";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-context";
import { Button } from "@/components/ui/button";
import ClosedBanner from "@/components/closed-banner";
import InfoBanner from "@/components/info-banner";
import { STORE_CLOSED_MSG } from "@/lib/flags";
import { useBusinessStatusSmart } from "@/lib/hooks/useBusinessStatus";
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

// ===== Helpers de formato y cálculos =====
const MAX_NOTES = 50;
const fmt = (n?: number | string) => {
  const v = typeof n === "string" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("es-AR")}`
    : "-";
};
const toNum = (v: unknown) =>
  typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;

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

// ===== Helper local para cotizar (usa /pricing/quote si existe) =====
type QuoteItemProductView = {
  kind: "PRODUCT";
  productId: number;
  name: string;
  qty: number;
  unitList: string;   // lista sin promo
  unitPrice: string;  // unitario efectivo (con promo y ponderación)
  total: string;      // qty * unitPrice
  options?: Array<{ id: number; name: string; extra: string }>;
  promo?: { type: string; value: string; units: number; applyToOptions: boolean };
  comment?: string | null;
};

async function quoteProduct(
  productId: number,
  qty: number,
  optionIds: number[] = [],
  comment?: string
): Promise<QuoteItemProductView | null> {
  try {
    const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!BASE) return null;

    const body = {
      channel: "WEB",
      lines: [
        {
          type: "PRODUCT",
          product_id: productId,
          quantity: qty,
          option_ids: optionIds,
          comment: comment ?? null,
        },
      ],
    };

    const res = await fetch(`${BASE}/pricing/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const item = Array.isArray(json?.items) ? json.items[0] : null;
    if (!item || item.kind !== "PRODUCT") return null;
    return item as QuoteItemProductView;
  } catch {
    return null;
  }
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();

  const [justAdded, setJustAdded] = useState(false);
  const { data: status } = useBusinessStatusSmart();
  // mientras carga: true => botón habilitado (si preferís bloquear hasta cargar, cambiá a !!status?.web.open)
  const isWebOpen  = status?.web?.open ?? true;
  const pickupOnly = !!(status?.pos?.open && status?.web?.open === false);

  const disabledByStatus = !isWebOpen;
  

  const [prod, setProd] = useState<Product | null>(null);
  const [selectedOptId, setSelectedOptId] = useState<string | number | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  // 💰 estados de cotización (promos)
  const [quotedUnit, setQuotedUnit] = useState<number | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [listUnit, setListUnit] = useState<number | null>(null);   // precio de lista (sin promo) por unidad
  const [hasPromo, setHasPromo] = useState(false);                 // flag si hay promo aplicada

  // 1) al montar en el CLIENTE, intento leer el warm cache
  useEffect(() => {
    if (!id) return;
    const warm = readWarmProduct(id); // seguro: la función ya tiene try/catch
    if (warm) {
      const ordered = warm.productOptions?.length ? [...warm.productOptions].sort(optionSorter) : [];
      setProd({ ...warm, productOptions: ordered });
      setSelectedOptId(ordered.find(o => o.isDefault)?.id ?? ordered[0]?.id ?? null);
      setLoading(false); // evita mostrar el loader si ya hay warm
    }
  }, [id]);
  
  // 2) fetch real (reemplaza o completa el warm)
  useEffect(() => {
  const BASE = process.env.NEXT_PUBLIC_API_URL;
  if (!id || !BASE) return;

  let aborted = false;
  (async () => {
    try {
      // si no hubo warm, mostramos loader; si hubo, puede quedar en false
      setLoading(prev => prev || !prod);
      const res = await fetch(`${BASE}/products/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("not ok");
      const raw = await res.json();
      const product: Product =
        raw?.data && !Array.isArray(raw.data) ? raw.data :
        raw?.data?.data && !Array.isArray(raw.data.data) ? raw.data.data :
        raw;

      const ordered = product.productOptions?.length ? [...product.productOptions].sort(optionSorter) : [];
      const productOrdered: Product = { ...product, productOptions: ordered };

      if (!aborted) {
        setProd(productOrdered);
        // si aún no había opción elegida, elegí default/primera
        setSelectedOptId(prev => prev ?? (ordered.find(o => o.isDefault)?.id ?? ordered[0]?.id ?? null));
      }

      // refresco warm
      try { sessionStorage.setItem(warmKey(productOrdered.id), JSON.stringify(productOrdered)); } catch {}
    } catch {
      // si falla el fetch, no rompas el warm
    } finally {
      if (!aborted) setLoading(false);
    }
  })();

  return () => { aborted = true; };
  // ⚠️ importante incluir `prod` solo para la línea setLoading(prev...)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // opción elegida
  const selectedOption = useMemo(() => {
    if (!prod?.productOptions?.length) return undefined;
    return prod.productOptions.find((o) => o.id === selectedOptId);
  }, [prod, selectedOptId]);

  // cálculo local (fallback)
  const base = toNum(prod?.price);
  const extra = toNum(selectedOption?.precio_extra);
  const localTotal = (base + extra) * qty;

  // 🔁 Cotizar en el back (promos) cada vez que cambian qty / option / producto
  useEffect(() => {
    (async () => {
      if (!prod?.id) {
        setQuotedUnit(null);
        setQuotedTotal(null);
        return;
      }
      const optionIds = selectedOption?.id ? [Number(selectedOption.id)] : [];
      const qres = await quoteProduct(Number(prod.id), Math.max(1, qty || 1), optionIds, notes?.trim() || undefined);

      if (qres) {
        const unit = Number(qres.unitPrice);
        const tot  = Number(qres.total);
        const list = Number(qres.unitList);
        if (Number.isFinite(unit) && Number.isFinite(tot)) {
          setQuotedUnit(unit);
          setQuotedTotal(tot);
          setListUnit(Number.isFinite(list) ? list : null);
          setHasPromo(!!qres.promo);        // 👈 si el back marcó promo
          return;
        }
      }
      // fallback local si la cotización falla/no aplica
      const unitLocal = base + extra;
      setQuotedUnit(unitLocal);
      setQuotedTotal(unitLocal * qty);
      setHasPromo(false);
      setListUnit(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.id, selectedOption?.id, qty]);

  const handleAdd = async () => {
    if (!prod) return;

    // usar cotización ya calculada (si está), con fallback
    let unit = quotedUnit;
    let total = quotedTotal;

    if (unit == null || total == null) {
      const optionIds = selectedOption?.id ? [Number(selectedOption.id)] : [];
      const qres = await quoteProduct(
        Number(prod.id),
        Math.max(1, qty || 1),
        optionIds,
        notes?.trim() || undefined
      );
      if (qres) {
        const u = Number(qres.unitPrice);
        const t = Number(qres.total);
        if (Number.isFinite(u) && Number.isFinite(t)) {
          unit = u;
          total = t;
        }
      }
      if (unit == null || total == null) {
        // último fallback local
        const baseNum =
          typeof prod.price === "string" ? Number(prod.price) : (prod.price ?? 0);
        const extraNum =
          typeof selectedOption?.precio_extra === "string"
            ? Number(selectedOption?.precio_extra)
            : (selectedOption?.precio_extra ?? 0);
        unit = baseNum + extraNum;
        total = unit * qty;
      }
    }

    const extraNum =
      typeof selectedOption?.precio_extra === "string"
        ? Number(selectedOption?.precio_extra)
        : (selectedOption?.precio_extra ?? 0);

    addToCart({
      uniqueId: `${prod.id}-${selectedOptId}-${Date.now()}`,
      id: Number(prod.id) || 0,
      name: prod.name || "",
      description: prod.description || "",
      price: unit,                 // 💰 unitario efectivo
      finalPrice: total,           // 💰 total efectivo
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
      <SiteHeader
        showBack
        onBack={() => router.back()}
        onCartClick={() => router.push("/carrito")}
      />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />
      <InfoBanner />

      {!prod && !loading ? (
        <div className="mx-auto w-full max-w-6xl p-4">
          No se encontró el producto.
        </div>
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
                  priority
                />
              </div>
            </div>

            <h2 className="text-xl font-extrabold uppercase">
              {prod?.name ?? "…"}
            </h2>

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
                      disabled={loading && !prod}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between",
                        active
                          ? "border-[var(--brand-color)] bg-[#fff5f2]"
                          : "border-transparent hover:bg-black/5",
                      ].join(" ")}
                    >
                      <span className="text-sm">{o.option?.name || "Opción"}</span>
                      <span className="text-sm font-semibold">
                        {plus ? `+${fmt(plus)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-2xl ring-1 ring-black/5 bg-white/60 p-3">
              <div className="text-sm font-semibold mb-2">Cantidad:</div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={loading && !prod}
                >
                  −
                </Button>
                <div className="w-8 text-center font-semibold">{qty}</div>
                <Button
                  variant="outline"
                  onClick={() => setQty((q) => q + 1)}
                  disabled={loading && !prod}
                >
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
                <div className="text-right">
                  {/* Si hay promo y tenemos unitList, mostramos el total de lista tachado */}
                  {hasPromo && listUnit != null && (
                    <div className="text-sm text-muted-foreground line-through">
                      {fmt(listUnit * qty)}
                    </div>
                  )}
                  <div className="text-xl font-extrabold text-[var(--brand-color)]">
                    {fmt(quotedTotal ?? localTotal)}
                  </div>
                  {/* Opcional: aclaración pequeña */}
                  {hasPromo && (
                    <div className="text-[11px] text-green-700 font-medium">
                      Precio promo aplicado
                    </div>
                  )}
                </div>
              </div>
              <Button
                className={`w-full text-white transition-colors
                  bg-[var(--brand-color)]
                  hover:bg-[color-mix(in_srgb,var(--brand-color),#000_12%)]
                  active:bg-[color-mix(in_srgb,var(--brand-color),#000_18%)]
                  hover:brightness-95 active:brightness-90
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none`}
                onClick={isWebOpen ? handleAdd : undefined}
                disabled={disabledByStatus || (loading && !prod)}
                title={
                  disabledByStatus
                    ? (pickupOnly ? "Solo tomamos pedidos en el local." : STORE_CLOSED_MSG)
                    : undefined
                }
                aria-disabled={disabledByStatus || (loading && !prod)}
              >
                {disabledByStatus
                  ? (pickupOnly ? "Solo en el local" : "Local cerrado")
                  : (justAdded ? "Agregado ✔" : "Agregar al Carrito")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Overlay bloqueante solo si no teníamos warm */}
      <BlockingLoader open={loading } message="Cargando producto…" />
    </div>
  );
}
